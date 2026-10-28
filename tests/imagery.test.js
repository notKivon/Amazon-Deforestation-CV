import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleImagery } from '../worker/imagery.js';
import { resetTokenCache, TOKEN_URL, PROCESS_URL } from '../worker/cdse.js';
import { FALSECOLOR } from '../shared/evalscripts.js';
import { decodePng } from './helpers/png.js';

const SECRET = 'very-secret-value';
const ENV = { CDSE_CLIENT_ID: 'sh-1234abcd-id', CDSE_CLIENT_SECRET: SECRET };
const MANAUS = { lon: -60.02, lat: -3.1, tilesPerSide: 4, year: 2024, product: 'falsecolor', window: 'base' };
const PNG_BYTES = new Uint8Array([137, 80, 78, 71]);

const post = (body) =>
  new Request('https://x.test/api/imagery', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

function mockFetch({ tokenStatus = 200, processStatus = 200, expiresIn = 600 } = {}) {
  return vi.fn(async (url) => {
    if (url === TOKEN_URL) {
      return tokenStatus === 200
        ? Response.json({ access_token: 'tok', expires_in: expiresIn })
        : new Response('denied', { status: tokenStatus });
    }
    if (url === PROCESS_URL) {
      return processStatus === 200 ? new Response(PNG_BYTES) : new Response('boom', { status: processStatus });
    }
    throw new Error(`unexpected ${url}`);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
  resetTokenCache();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('validation', () => {
  const cases = [
    ['not json', 'invalid_json'],
    [[1, 2], 'invalid_json'],
    [{ ...MANAUS, bbox: [0, 0, 1, 1] }, 'unexpected_field'],
    [{ ...MANAUS, evalscript: 'x' }, 'unexpected_field'],
    [{ ...MANAUS, lon: '-60' }, 'invalid_lon'],
    [{ ...MANAUS, lat: null }, 'invalid_lat'],
    [{ ...MANAUS, tilesPerSide: 9 }, 'invalid_tilesPerSide'],
    [{ ...MANAUS, tilesPerSide: 1 }, 'invalid_tilesPerSide'],
    [{ ...MANAUS, tilesPerSide: 4.5 }, 'invalid_tilesPerSide'],
    [{ ...MANAUS, product: 'swir' }, 'invalid_product'],
    [{ ...MANAUS, window: 'year' }, 'invalid_window'],
    [{ ...MANAUS, year: 2016 }, 'invalid_year'],
    [{ ...MANAUS, year: 2027 }, 'invalid_year'],
    [{ ...MANAUS, year: '2024' }, 'invalid_year'],
    [{ ...MANAUS, lon: -47.88, lat: -15.79 }, 'outside_amazon'],
    ['x'.repeat(2000), 'body_too_large'],
  ];
  for (const [body, error] of cases) {
    it(`400 ${error}`, async () => {
      const f = mockFetch();
      vi.stubGlobal('fetch', f);
      const res = await handleImagery(post(body), ENV);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error });
      expect(f).not.toHaveBeenCalled();
    });
  }

  it('north zone: 2026 is available on 2026-10-28 (May 1 cutoff passed)', async () => {
    vi.stubGlobal('fetch', mockFetch());
    const res = await handleImagery(post({ ...MANAUS, lon: -58.8, lat: 4.5, year: 2026 }), ENV);
    expect(res.status).toBe(200);
  });
});

describe('CDSE request', () => {
  it('builds the Process API request server-side', async () => {
    const f = mockFetch();
    vi.stubGlobal('fetch', f);
    const res = await handleImagery(post(MANAUS), ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=2592000');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG_BYTES);

    const [, init] = f.mock.calls.find(([u]) => u === PROCESS_URL);
    expect(init.headers.Authorization).toBe('Bearer tok');
    const body = JSON.parse(init.body);
    expect(body.input.bounds.properties.crs).toBe('http://www.opengis.net/def/crs/EPSG/0/32720');
    const [minX, minY, maxX, maxY] = body.input.bounds.bbox;
    expect(maxX - minX).toBe(5120);
    expect(maxY - minY).toBe(5120);
    expect(body.input.data[0]).toEqual({
      type: 'sentinel-2-l2a',
      dataFilter: {
        timeRange: { from: '2024-06-01T00:00:00Z', to: '2024-08-31T23:59:59Z' },
        mosaickingOrder: 'leastCC',
        maxCloudCoverage: 80,
      },
    });
    expect(body.output).toEqual({
      width: 512,
      height: 512,
      responses: [{ identifier: 'default', format: { type: 'image/png' } }],
    });
    expect(body.evalscript).toBe(FALSECOLOR);
  });

  it('uses the extended north window when asked', async () => {
    const f = mockFetch();
    vi.stubGlobal('fetch', f);
    await handleImagery(post({ ...MANAUS, lon: -58.8, lat: 4.5, year: 2025, window: 'extended' }), ENV);
    const body = JSON.parse(f.mock.calls.find(([u]) => u === PROCESS_URL)[1].body);
    expect(body.input.data[0].dataFilter.timeRange).toEqual({ from: '2024-11-01T00:00:00Z', to: '2025-04-30T23:59:59Z' });
    expect(body.input.bounds.properties.crs).toMatch(/EPSG\/0\/32621$/);
  });
});

describe('token cache', () => {
  const tokenCalls = (f) => f.mock.calls.filter(([u]) => u === TOKEN_URL).length;

  it('reuses the token until expires_in − 60 s', async () => {
    const f = mockFetch({ expiresIn: 600 });
    vi.stubGlobal('fetch', f);
    await handleImagery(post(MANAUS), ENV);
    await handleImagery(post({ ...MANAUS, product: 'nbr' }), ENV);
    expect(tokenCalls(f)).toBe(1);
    vi.setSystemTime(new Date(Date.now() + 539_000));
    await handleImagery(post(MANAUS), ENV);
    expect(tokenCalls(f)).toBe(1);
    vi.setSystemTime(new Date(Date.now() + 2_000));
    await handleImagery(post(MANAUS), ENV);
    expect(tokenCalls(f)).toBe(2);
  });

  it('sends client credentials as a form body', async () => {
    const f = mockFetch();
    vi.stubGlobal('fetch', f);
    await handleImagery(post(MANAUS), ENV);
    const [, init] = f.mock.calls.find(([u]) => u === TOKEN_URL);
    const form = new URLSearchParams(init.body.toString());
    expect(form.get('grant_type')).toBe('client_credentials');
    expect(form.get('client_secret')).toBe(SECRET);
  });
});

describe('errors', () => {
  it('upstream failure → 502 with upstreamStatus, no secrets echoed or logged', async () => {
    const log = vi.spyOn(console, 'log');
    const err = vi.spyOn(console, 'error');
    vi.stubGlobal('fetch', mockFetch({ processStatus: 503 }));
    const res = await handleImagery(post(MANAUS), ENV);
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: 'upstream_error', upstreamStatus: 503 });
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(ENV.CDSE_CLIENT_ID);
    for (const call of [...log.mock.calls, ...err.mock.calls]) expect(String(call)).not.toContain(SECRET);
  });

  it('token failure → 502 auth_failed', async () => {
    vi.stubGlobal('fetch', mockFetch({ tokenStatus: 401 }));
    const res = await handleImagery(post(MANAUS), ENV);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'auth_failed', upstreamStatus: 401 });
  });

  it('network failure → 502 upstream_unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u) => {
      if (u === TOKEN_URL) return Response.json({ access_token: 'tok', expires_in: 600 });
      throw new TypeError('network down');
    }));
    const res = await handleImagery(post(MANAUS), ENV);
    expect(await res.json()).toEqual({ error: 'upstream_unreachable', upstreamStatus: 0 });
  });

  it('missing secrets → 500 not_configured', async () => {
    const res = await handleImagery(post(MANAUS), {});
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'not_configured' });
  });
});

describe('Cache API', () => {
  it('serves a cache hit without calling CDSE', async () => {
    const f = mockFetch();
    vi.stubGlobal('fetch', f);
    const match = vi.fn(async () => new Response('cached', { headers: { 'Content-Type': 'image/png' } }));
    vi.stubGlobal('caches', { default: { match, put: vi.fn(async () => {}) } });
    const res = await handleImagery(post(MANAUS), ENV);
    expect(await res.text()).toBe('cached');
    expect(f).not.toHaveBeenCalled();
    expect(decodeURIComponent(match.mock.calls[0][0].url)).toContain('imagery:falsecolor:base:-60.02000:-3.10000:4:2024');
  });

  it('stores misses via waitUntil', async () => {
    vi.stubGlobal('fetch', mockFetch());
    const put = vi.fn(async () => {});
    vi.stubGlobal('caches', { default: { match: vi.fn(async () => undefined), put } });
    const waitUntil = vi.fn();
    const res = await handleImagery(post(MANAUS), ENV, { waitUntil });
    expect(res.status).toBe(200);
    expect(put).toHaveBeenCalledOnce();
    expect(waitUntil).toHaveBeenCalledOnce();
  });

  it('fails silently when the cache throws (as on workers.dev or a broken cache)', async () => {
    vi.stubGlobal('fetch', mockFetch());
    vi.stubGlobal('caches', {
      default: {
        match: vi.fn(async () => { throw new Error('no cache'); }),
        put: vi.fn(() => { throw new Error('no cache'); }),
      },
    });
    const res = await handleImagery(post(MANAUS), ENV, { waitUntil: vi.fn() });
    expect(res.status).toBe(200);
  });
});

describe('MOCK mode', () => {
  const mockEnv = { MOCK: '1' };
  const tileValidFraction = (img, n) => {
    let valid = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      let ok = 0;
      for (let y = r * 128; y < (r + 1) * 128; y++) for (let x = c * 128; x < (c + 1) * 128; x++) {
        if (img.rgb[(y * img.width + x) * 3 + 1] === 255) ok++;
      }
      if (ok / (128 * 128) >= 0.7) valid++;
    }
    return valid / (n * n);
  };

  it('returns a PNG of the requested size without calling CDSE', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    for (const tilesPerSide of [2, 5, 8]) {
      const res = await handleImagery(post({ ...MANAUS, tilesPerSide }), mockEnv);
      expect(res.status).toBe(200);
      const img = await decodePng(await res.arrayBuffer());
      expect([img.width, img.height]).toEqual([tilesPerSide * 128, tilesPerSide * 128]);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('still validates and rejects areas outside the Amazon', async () => {
    const res = await handleImagery(post({ ...MANAUS, lon: -47.88, lat: -15.79 }), mockEnv);
    expect(await res.json()).toEqual({ error: 'outside_amazon' });
  });

  it('nbr base is cloudy (< 50% valid tiles) in odd years; extended and even years are clear', async () => {
    const frac = async (year, window) => {
      const res = await handleImagery(post({ ...MANAUS, tilesPerSide: 8, product: 'nbr', year, window }), mockEnv);
      return tileValidFraction(await decodePng(await res.arrayBuffer()), 8);
    };
    expect(await frac(2023, 'base')).toBeLessThan(0.5);
    expect(await frac(2023, 'extended')).toBeGreaterThanOrEqual(0.5);
    expect(await frac(2024, 'base')).toBeGreaterThanOrEqual(0.5);
  });
});
