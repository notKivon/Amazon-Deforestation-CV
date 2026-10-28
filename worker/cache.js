// Cloudflare Cache API wrapper. A no-op on *.workers.dev; works on a custom domain.
// Every call fails silently so caching can never break a response.
export const CACHE_CONTROL = 'public, max-age=2592000';

export function cacheKey({ product, window, lon, lat, tilesPerSide, year }) {
  const id = `imagery:${product}:${window}:${lon.toFixed(5)}:${lat.toFixed(5)}:${tilesPerSide}:${year}`;
  return new Request(`https://imagery-cache.invalid/${encodeURIComponent(id)}`);
}

function store() {
  try {
    return typeof caches !== 'undefined' && caches.default ? caches.default : null;
  } catch {
    return null;
  }
}

export async function cacheGet(key) {
  try {
    return (await store()?.match(key)) ?? null;
  } catch {
    return null;
  }
}

export function cachePut(key, response, ctx) {
  try {
    const c = store();
    if (!c) return;
    const p = c.put(key, response).catch(() => {});
    if (ctx?.waitUntil) ctx.waitUntil(p);
  } catch {
    /* ignore */
  }
}
