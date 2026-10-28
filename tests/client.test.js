import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClient, createLimiter, ImageryError } from '../src/api/client.js';
import { handleImagery } from '../worker/imagery.js';
import { areaBox, tileGrid } from '../src/geo/grid.js';
import { tileValidity, validTileShare } from '../src/analysis/report.js';
import { decodePng } from './helpers/png.js';

const AREA = { lon: -60.02, lat: -3.1, tilesPerSide: 4 };
const GRID = tileGrid(areaBox(AREA.lon, AREA.lat, AREA.tilesPerSide));

// Test decode: PNG blob → ImageData-like RGBA.
async function decode(blob) {
  const { width, height, rgb } = await decodePng(await blob.arrayBuffer());
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data.set(rgb.subarray(i * 3, i * 3 + 3), i * 4);
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

// fetch that runs the real Worker handler in MOCK mode and records calls.
function mockServer({ transform } = {}) {
  const calls = [];
  let inFlight = 0;
  const stats = { maxInFlight: 0 };
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    inFlight++;
    stats.maxInFlight = Math.max(stats.maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 1));
    try {
      const res = await handleImagery(new Request(`https://x.test${url}`, init), { MOCK: '1' });
      return transform ? transform(body, res) : res;
    } finally {
      inFlight--;
    }
  };
  return { fetchImpl, calls, stats };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('fetchYears (MOCK)', () => {
  it('clear year: 3 requests, all base', async () => {
    const s = mockServer();
    const [r] = await createClient({ fetchImpl: s.fetchImpl, decode }).fetchYears({ area: AREA, grid: GRID, years: [2024] });
    expect(r.window).toBe('base');
    expect(s.calls).toHaveLength(3);
    expect(s.calls.every((c) => c.window === 'base')).toBe(true);
    expect(s.calls.map((c) => c.product).sort()).toEqual(['falsecolor', 'nbr', 'truecolor']);
    expect([r.falsecolor.width, r.truecolor.height]).toEqual([512, 512]);
  });

  it('cloudy-base year: 4 requests, all products from extended', async () => {
    const s = mockServer();
    const [r] = await createClient({ fetchImpl: s.fetchImpl, decode }).fetchYears({ area: AREA, grid: GRID, years: [2023] });
    expect(r.window).toBe('extended');
    expect(s.calls).toHaveLength(4);
    expect(s.calls.map((c) => `${c.product}:${c.window}`).sort()).toEqual(
      ['falsecolor:extended', 'nbr:base', 'nbr:extended', 'truecolor:extended'],
    );
  });

  it('cloudy in both windows: returns extended, later marked too cloudy', async () => {
    // Blank every nbr mask so both windows are fully invalid.
    const transform = async (body, res) => {
      if (body.product !== 'nbr') return res;
      const img = await decode(await res.blob());
      for (let i = 1; i < img.data.length; i += 4) img.data[i] = 0;
      return { ok: true, blob: async () => img };
    };
    const s = mockServer({ transform });
    const client = createClient({ fetchImpl: s.fetchImpl, decode: async (x) => (x.data ? x : decode(x)) });
    const [r] = await client.fetchYears({ area: AREA, grid: GRID, years: [2024] });
    expect(r.window).toBe('extended');
    expect(s.calls).toHaveLength(4);
    expect(validTileShare(tileValidity(r.nbr, GRID))).toBeLessThan(0.5);
  });

  it('keeps at most 3 requests in flight and grows the progress total on fallback', async () => {
    const s = mockServer();
    const progress = [];
    const years = [2019, 2020, 2021, 2022, 2023, 2024];
    const out = await createClient({ fetchImpl: s.fetchImpl, decode }).fetchYears({
      area: AREA, grid: GRID, years, onProgress: (p) => progress.push(p),
    });
    expect(out.map((r) => r.year)).toEqual(years);
    expect(s.stats.maxInFlight).toBeLessThanOrEqual(3);
    expect(s.stats.maxInFlight).toBe(3);
    const fallbacks = out.filter((r) => r.window === 'extended').length;
    expect(fallbacks).toBe(3); // odd years
    expect(progress.at(-1)).toEqual({ done: 18 + fallbacks, total: 18 + fallbacks });
    expect(progress.map((p) => p.done)).toEqual(progress.map((_, i) => i + 1));
  });
});

describe('errors', () => {
  it('surfaces the proxy error code (outside_amazon)', async () => {
    const s = mockServer();
    const client = createClient({ fetchImpl: s.fetchImpl, decode });
    const err = await client
      .fetchYears({ area: { lon: -47.88, lat: -15.79, tilesPerSide: 2 }, grid: GRID, years: [2024] })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ImageryError);
    expect(err.code).toBe('outside_amazon');
    expect(err.status).toBe(400);
  });

  it('maps network failures and non-JSON errors', async () => {
    const net = createClient({ fetchImpl: async () => { throw new TypeError('offline'); }, decode });
    expect((await net.fetchYears({ area: AREA, grid: GRID, years: [2024] }).catch((e) => e)).code).toBe('network');
    const html = createClient({ fetchImpl: async () => new Response('<html>', { status: 503 }), decode });
    expect((await html.fetchYears({ area: AREA, grid: GRID, years: [2024] }).catch((e) => e)).code).toBe('http_503');
  });

  it('aborts outstanding requests after the first failure', async () => {
    const signals = [];
    let n = 0;
    const fetchImpl = (url, init) => {
      signals.push(init.signal);
      if (n++ === 0) return Promise.resolve(new Response('{"error":"upstream_error"}', { status: 502 }));
      return new Promise((_, reject) =>
        init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
    };
    const err = await createClient({ fetchImpl, decode })
      .fetchYears({ area: AREA, grid: GRID, years: [2022, 2023, 2024] })
      .catch((e) => e);
    expect(err.code).toBe('upstream_error');
    expect(signals.every((s) => s.aborted)).toBe(true);
  });
});

describe('createLimiter', () => {
  it('runs tasks in order with a cap', async () => {
    const limit = createLimiter(2);
    let active = 0, peak = 0;
    const order = [];
    await Promise.all([1, 2, 3, 4, 5].map((i) => limit(async () => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 2));
      order.push(i); active--;
    })));
    expect(peak).toBe(2);
    expect(order).toHaveLength(5);
  });
});
