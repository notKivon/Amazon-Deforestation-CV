// End-to-end run: fetch every year, load the model in parallel, classify the valid tiles
// of each reported year, and build the report.
import { tileValidity, tileNbr, buildReport, VALID_PIXEL_MIN, validTileShare, REPORTED_TILE_MIN } from '../analysis/report.js';

/**
 * deps: { client, loadModel: () => Promise<loaded>, classifyScene }
 * Returns { report, scenes } where scenes[i] = { year, window, truecolor, falsecolor, nbr }.
 * onProgress({ phase: 'fetch' | 'classify', done, total })
 */
export async function runPipeline({ area, grid, years, deps, onProgress = () => {}, signal }) {
  const modelPromise = deps.loadModel();
  modelPromise.catch(() => {}); // surfaced below, after fetching
  const scenes = await deps.client.fetchYears({
    area, grid, years, signal,
    onProgress: (p) => onProgress({ phase: 'fetch', ...p }),
  });
  onProgress({ phase: 'model' });
  const loaded = await modelPromise;

  const perYear = [];
  for (let k = 0; k < scenes.length; k++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const s = scenes[k];
    const validity = tileValidity(s.nbr, grid);
    const reported = validTileShare(validity) >= REPORTED_TILE_MIN;
    const probs = reported
      ? await deps.classifyScene(loaded, s.falsecolor, grid, (i) => validity[i] >= VALID_PIXEL_MIN)
      : grid.map(() => null);
    perYear.push({ year: s.year, window: s.window, validity, nbr: tileNbr(s.nbr, grid), probs });
    onProgress({ phase: 'classify', done: k + 1, total: scenes.length });
  }
  return { report: buildReport(perYear), scenes };
}
