// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createControls, sizeLabel } from '../src/ui/controls.js';
import { createSearch } from '../src/ui/search.js';
import { createStatus, errorMessage, OUTSIDE_AMAZON } from '../src/ui/status.js';
import { createMap, ATTRIBUTION } from '../src/ui/map.js';
import { areaBox, boxCornersLatLon } from '../src/geo/grid.js';

beforeEach(() => { document.body.innerHTML = ''; });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('controls', () => {
  it('offers 2–8 tiles per side in km, default 4, and fires callbacks', () => {
    const onSizeChange = vi.fn(), onRun = vi.fn();
    const c = createControls(document.body, { onSizeChange, onRun });
    const select = document.querySelector('select');
    expect([...select.options].map((o) => o.value)).toEqual(['2', '3', '4', '5', '6', '7', '8']);
    expect(c.tilesPerSide).toBe(4);
    expect(sizeLabel(8)).toBe('8 × 8 tiles (10.24 km)');
    select.value = '6';
    select.dispatchEvent(new Event('change'));
    expect(onSizeChange).toHaveBeenCalledWith(6);

    const run = document.querySelector('button.run');
    expect(run.disabled).toBe(true);
    c.setSelection({ lon: -60, lat: -3 }, true);
    expect(run.disabled).toBe(false);
    run.click();
    expect(onRun).toHaveBeenCalledOnce();
  });

  it('busy state shows Cancel and offers a keyboard way to choose the map centre', () => {
    const onCancel = vi.fn(), onUseMapCentre = vi.fn();
    const c = createControls(document.body, { onCancel, onUseMapCentre });
    const cancel = document.querySelector('button.cancel');
    expect(cancel.hidden).toBe(true);
    c.setBusy(true);
    expect(cancel.hidden).toBe(false);
    expect(document.querySelector('button.run').disabled).toBe(true);
    cancel.click();
    expect(onCancel).toHaveBeenCalledOnce();
    c.setBusy(false);
    expect(cancel.hidden).toBe(true);
    const centre = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Choose the map centre');
    centre.click();
    expect(onUseMapCentre).toHaveBeenCalledOnce();
  });

  it('shows the zone and its window', () => {
    const c = createControls(document.body);
    c.setSelection({ lon: -58.8, lat: 4.5 }, true);
    expect(document.querySelector('.zone').textContent).toMatch(/North zone: dry season Dec–Mar/);
    c.setSelection({ lon: -60, lat: 1.999 }, true);
    expect(document.querySelector('.zone').textContent).toMatch(/South zone: dry season Jun–Aug/);
  });

  it('outside the Amazon: Run disabled and the message shown', () => {
    const c = createControls(document.body);
    c.setSelection({ lon: -47.88, lat: -15.79 }, false);
    expect(document.querySelector('button.run').disabled).toBe(true);
    const msg = document.querySelector('.outside-msg');
    expect(msg.hidden).toBe(false);
    expect(msg.textContent).toBe(OUTSIDE_AMAZON);
  });
});

describe('search', () => {
  const places = [
    { display_name: 'Manaus, Amazonas, Brazil', lon: '-60.02', lat: '-3.10' },
    { display_name: 'Brasília, Distrito Federal, Brazil', lon: '-47.88', lat: '-15.79' },
  ];

  it('queries Nominatim on submit and greys out results outside the Amazon', async () => {
    const fetchImpl = vi.fn(async () => Response.json(places));
    const onChoose = vi.fn();
    createSearch(document.body, { fetchImpl, onChoose });
    document.querySelector('input').value = 'Manaus';
    document.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush(); await flush();
    expect(fetchImpl.mock.calls[0][0]).toBe('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=Manaus');
    const [inside, outside] = document.querySelectorAll('.search-results button');
    expect(inside.disabled).toBe(false);
    expect(outside.disabled).toBe(true);
    expect(outside.textContent).toMatch(/outside the Amazon/);
    inside.click();
    expect(onChoose).toHaveBeenCalledWith({ lon: -60.02, lat: -3.1, name: 'Manaus' });
    expect(document.body.textContent).toMatch(/Search © OpenStreetMap contributors/);
  });

  it('allows at most one request per second', async () => {
    let t = 10_000;
    const fetchImpl = vi.fn(async () => Response.json([]));
    const s = createSearch(document.body, { fetchImpl, now: () => t });
    s.input.value = 'x';
    await s.run();
    t += 500;
    await s.run();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    t += 600;
    await s.run();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('shows a readable message when search fails', async () => {
    const s = createSearch(document.body, { fetchImpl: async () => new Response('', { status: 503 }) });
    s.input.value = 'x';
    await s.run();
    expect(document.querySelector('.search-message').textContent).toMatch(/unavailable/);
  });
});

describe('status', () => {
  it('shows loading with progress, then a readable error', () => {
    const s = createStatus(document.body);
    s.show('loading', 'Fetching images…', { done: 2, total: 30 });
    expect(s.el.hidden).toBe(false);
    expect(s.el.querySelector('progress').value).toBe(2);
    s.error({ code: 'outside_amazon' });
    expect(s.el.getAttribute('role')).toBe('alert');
    expect(s.el.textContent).toContain(OUTSIDE_AMAZON);
    s.clear();
    expect(s.el.hidden).toBe(true);
  });

  it('maps codes to readable text', () => {
    expect(errorMessage({ code: 'network' })).toMatch(/connection/);
    expect(errorMessage({ code: 'http_503' })).toMatch(/503/);
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage(new DOMException('Aborted', 'AbortError'))).toBe('Cancelled.');
    expect(errorMessage({ code: 'model_load' })).toMatch(/model could not be loaded/);
  });
});

describe('map', () => {
  it('mounts with OSM + RAISG attribution, emits clicks, and draws the area', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const onSelect = vi.fn();
    const m = createMap(el, { onSelect });
    expect(ATTRIBUTION).toMatch(/OpenStreetMap/);
    expect(ATTRIBUTION).toMatch(/Amazon boundary © <a [^>]+>RAISG<\/a> 2025|Amazon boundary &copy; <a [^>]+>RAISG<\/a> 2025/);
    m.map.fire('click', { latlng: { lat: -3.1, lng: -60.02 } });
    expect(onSelect).toHaveBeenCalledWith({ lon: -60.02, lat: -3.1 });
    const box = areaBox(-60.02, -3.1, 4);
    expect(() => m.setArea({ lon: -60.02, lat: -3.1 }, boxCornersLatLon(box), true)).not.toThrow();
  });
});
