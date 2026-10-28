// Calls /api/imagery for every year: nbr (base, then extended if < 50% of tiles are valid),
// then falsecolor + truecolor with the same window. At most 3 requests in flight overall.
import { tileValidity, validTileShare, REPORTED_TILE_MIN } from '../analysis/report.js';
import { decodePng } from './decode.js';

export const MAX_IN_FLIGHT = 3;

export class ImageryError extends Error {
  constructor(code, status = 0) {
    super(code);
    this.code = code; // e.g. outside_amazon, upstream_error, network, http_500
    this.status = status;
  }
}

export function createLimiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { task, resolve, reject } = queue.shift();
    task().then(resolve, reject).finally(() => { active--; next(); });
  };
  return (task) => new Promise((resolve, reject) => { queue.push({ task, resolve, reject }); next(); });
}

export function createClient({ fetchImpl = (...a) => fetch(...a), decode = decodePng, maxInFlight = MAX_IN_FLIGHT } = {}) {
  const limit = createLimiter(maxInFlight);

  async function request(params, signal) {
    let res;
    try {
      res = await fetchImpl('/api/imagery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal,
      });
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      throw new ImageryError('network');
    }
    if (!res.ok) {
      let code = `http_${res.status}`;
      try { code = (await res.json()).error || code; } catch { /* not JSON */ }
      throw new ImageryError(code, res.status);
    }
    return decode(await res.blob());
  }

  /**
   * area: { lon, lat, tilesPerSide }, grid: tileGrid(box), years: number[].
   * onProgress({ done, total }) after each completed request.
   * Resolves to [{ year, window, nbr, falsecolor, truecolor }] in year order.
   */
  async function fetchYears({ area, grid, years, onProgress = () => {}, signal }) {
    // One failure (or the caller's abort) cancels every outstanding request.
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort);
    if (signal?.aborted) ctrl.abort();
    const progress = { done: 0, total: years.length * 3 };
    const get = (year, product, window) =>
      limit(() => {
        if (ctrl.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        return request({ ...area, year, product, window }, ctrl.signal);
      }).then((img) => {
        progress.done++;
        onProgress({ ...progress });
        return img;
      });

    const all = Promise.all(
      years.map(async (year) => {
        let window = 'base';
        let nbr = await get(year, 'nbr', 'base');
        if (validTileShare(tileValidity(nbr, grid)) < REPORTED_TILE_MIN) {
          window = 'extended';
          progress.total++;
          nbr = await get(year, 'nbr', 'extended');
        }
        const [falsecolor, truecolor] = await Promise.all([
          get(year, 'falsecolor', window),
          get(year, 'truecolor', window),
        ]);
        return { year, window, nbr, falsecolor, truecolor };
      }),
    );
    try {
      return await all;
    } catch (err) {
      ctrl.abort();
      throw err;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  return { fetchYears };
}
