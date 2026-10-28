// Copernicus proxy for POST /api/imagery → PNG for one product, year, and window.
import { areaBox, areaInsideAmazon, windowFor, zoneFor } from '../shared/geo.js';
import { EVALSCRIPTS } from '../shared/evalscripts.js';
import { validateBody } from './validate.js';
import { buildProcessRequest, fetchImage, UpstreamError } from './cdse.js';
import { cacheKey, cacheGet, cachePut, CACHE_CONTROL } from './cache.js';
import { mockPng, mockSeed } from './mock.js';

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function png(bytes, cacheControl) {
  return new Response(bytes, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': cacheControl } });
}

export async function handleImagery(request, env = {}, ctx) {
  const check = validateBody(await request.text());
  if (!check.ok) return json(400, { error: check.error });
  const q = check.value;

  const box = areaBox(q.lon, q.lat, q.tilesPerSide);
  if (!areaInsideAmazon(box)) return json(400, { error: 'outside_amazon' });
  const window = windowFor(zoneFor(q.lat), q.year, q.window);

  if (env.MOCK === '1') {
    const bytes = await mockPng({ ...q, width: box.width, height: box.height, seed: mockSeed(box) });
    return png(bytes, 'no-store');
  }
  if (!env.CDSE_CLIENT_ID || !env.CDSE_CLIENT_SECRET) return json(500, { error: 'not_configured' });

  const key = cacheKey(q);
  const hit = await cacheGet(key);
  if (hit) return hit;

  try {
    const bytes = await fetchImage(env, buildProcessRequest({ box, window, evalscript: EVALSCRIPTS[q.product] }));
    cachePut(key, png(bytes, CACHE_CONTROL), ctx);
    return png(bytes, CACHE_CONTROL);
  } catch (err) {
    if (err instanceof UpstreamError) return json(502, { error: err.error, upstreamStatus: err.upstreamStatus });
    return json(502, { error: 'upstream_error', upstreamStatus: 0 });
  }
}
