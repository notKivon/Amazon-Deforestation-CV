// Validates POST /api/imagery bodies. Clients choose only the place, size, year, product,
// and base/extended; the server derives the box and dates.
import { availableYears, zoneFor, MIN_TILES_PER_SIDE, MAX_TILES_PER_SIDE } from '../shared/geo.js';

export const PRODUCTS = ['truecolor', 'falsecolor', 'nbr'];
export const WINDOWS = ['base', 'extended'];
const FIELDS = ['lon', 'lat', 'tilesPerSide', 'year', 'product', 'window'];
const MAX_BODY = 1024;

const round5 = (v) => Math.round(v * 1e5) / 1e5;

/** Returns { ok: true, value } or { ok: false, error }. */
export function validateBody(text, now = new Date()) {
  if (text.length > MAX_BODY) return { ok: false, error: 'body_too_large' };
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'invalid_json' };
  for (const k of Object.keys(body)) if (!FIELDS.includes(k)) return { ok: false, error: 'unexpected_field' };

  const { lon, lat, tilesPerSide, year, product, window } = body;
  if (typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180) return { ok: false, error: 'invalid_lon' };
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) return { ok: false, error: 'invalid_lat' };
  if (!Number.isInteger(tilesPerSide) || tilesPerSide < MIN_TILES_PER_SIDE || tilesPerSide > MAX_TILES_PER_SIDE) {
    return { ok: false, error: 'invalid_tilesPerSide' };
  }
  if (!PRODUCTS.includes(product)) return { ok: false, error: 'invalid_product' };
  if (!WINDOWS.includes(window)) return { ok: false, error: 'invalid_window' };
  // Round to 5 dp (~1 m) so the cache key and the request box always agree.
  const value = { lon: round5(lon), lat: round5(lat), tilesPerSide, year, product, window };
  if (!Number.isInteger(year) || !availableYears(zoneFor(value.lat), now).includes(year)) {
    return { ok: false, error: 'invalid_year' };
  }
  return { ok: true, value };
}
