// App wiring and state.
import './styles.css';
import { areaBox, boxCornersLatLon, tileGrid } from './geo/grid.js';
import { areaInsideAmazon } from './geo/region.js';
import { zoneFor } from './geo/season.js';
import { availableYears } from './geo/years.js';
import { createClient } from './api/client.js';
import { runPipeline } from './app/pipeline.js';
import { renderReport } from './ui/report.js';
import { renderModelView } from './ui/model-view.js';
import { TILE_COLOURS, describeTile } from './ui/tiles.js';
import { createMap } from './ui/map.js';
import { createSearch } from './ui/search.js';
import { createControls } from './ui/controls.js';
import { createStatus, errorMessage } from './ui/status.js';
import { h } from './ui/dom.js';

const state = { centre: null, box: null, inside: false, busy: false, result: null, view: null, stale: false };
const client = createClient();

// TensorFlow.js is large: load it (and the model) only when the first run starts.
let modelDeps = null;
function loadModelDeps() {
  modelDeps ??= Promise.all([import('./model/load.js'), import('./model/classify.js')]).then(async ([load, cls]) => {
    await load.initBackend();
    return { loaded: await load.loadModel(), classifyScene: cls.classifyScene };
  }).catch((err) => {
    console.error(err);
    throw Object.assign(new Error('model_load'), { code: 'model_load' });
  });
  modelDeps.catch(() => { modelDeps = null; });
  return modelDeps;
}

const panel = document.getElementById('panel');
const search = createSearch(panel, { onChoose: (place) => select(place, true) });
const controls = createControls(panel, {
  onSizeChange: () => refresh(),
  onRun: () => run(),
  onCancel: () => state.abort?.abort(),
  onUseMapCentre: () => {
    const c = mapView.map.getCenter().wrap();
    select({ lon: c.lng, lat: c.lat }, false);
  },
});
const status = createStatus(panel);
const mapView = createMap(document.getElementById('map'), { onSelect: (p) => select(p, false) });

function select(point, fly) {
  if (state.busy) return; // the area can't change mid-run (Cancel first)
  state.centre = point;
  refresh();
  // Zoom to the area for search results, or for a click made while zoomed far out.
  if (fly || mapView.map.getZoom() < 9) mapView.fitArea(boxCornersLatLon(state.box));
}

function refresh() {
  if (!state.centre) return;
  const { lon, lat } = state.centre;
  state.box = areaBox(lon, lat, controls.tilesPerSide);
  state.inside = areaInsideAmazon(state.box);
  mapView.setArea(state.centre, boxCornersLatLon(state.box), state.inside);
  controls.setSelection(state.centre, state.inside, state.busy);
  if (!state.busy) status.clear();
  const a = state.result?.area;
  if (a && (a.lon !== lon || a.lat !== lat || a.tilesPerSide !== controls.tilesPerSide)) setStale(true);
}

// Results stay visible after the selection changes, but are marked as belonging to the
// previous area and no longer drawn on the map.
function setStale(stale) {
  state.stale = stale;
  for (const id of ['report', 'model-view']) {
    const section = document.getElementById(id);
    section.classList.toggle('stale', stale);
    const note = section.querySelector('.stale-note');
    if (!stale) note?.remove();
    else if (!note) {
      section.querySelector('h2')?.after(h('p', { class: 'stale-note', role: 'status' },
        'These results are for the previous area. Run the analysis again for the new selection.'));
    }
  }
}

function showOnMap(grid, yearReport) {
  mapView.setGrid(grid.map((t, i) => {
    const tile = yearReport.reported ? yearReport.tiles[i] : null;
    const style = tile?.valid
      ? { color: TILE_COLOURS[tile.cls], fillColor: TILE_COLOURS[tile.cls], fillOpacity: 0.2, weight: tile.loss ? 3 : 1.5 }
      : { color: '#888', fillColor: '#555', fillOpacity: 0.35, dashArray: '4 4', weight: 1 };
    return { cornersLatLon: t.cornersLatLon, style, title: `${yearReport.year}: ${describeTile(tile)}` };
  }));
}

async function run() {
  if (!state.inside || state.busy) return;
  const area = { lon: state.centre.lon, lat: state.centre.lat, tilesPerSide: controls.tilesPerSide };
  const zone = zoneFor(area.lat);
  const grid = tileGrid(state.box);
  const years = availableYears(zone, new Date());
  state.busy = true;
  state.abort = new AbortController();
  controls.setBusy(true);
  status.show('loading', `Fetching ${years.length} years of images…`, { done: 0, total: years.length * 3 });
  try {
    let model = null;
    const { report, scenes } = await runPipeline({
      area, grid, years, signal: state.abort.signal,
      deps: {
        client,
        loadModel: async () => (model = await loadModelDeps()).loaded,
        classifyScene: (...a) => model.classifyScene(...a),
      },
      onProgress: (p) => {
        if (p.phase === 'model') status.show('loading', 'Loading the forest model…');
        else if (p.phase === 'fetch') status.show('loading', `Fetching images… (${p.done} of ${p.total})`, p);
        else status.show('loading', `Classifying tiles… (year ${p.done} of ${p.total})`, p);
      },
    });
    state.result = { report, scenes, grid, zone, area };
    setStale(false);
    state.view?.destroy();
    renderModelView(document.getElementById('model-view'));
    state.view = renderReport(document.getElementById('report'), state.result, {
      createChart: (canvas, r) => import('./ui/chart.js').then((m) => m.createChart(canvas, r)),
      onYearChange: (i) => { if (!state.stale) showOnMap(grid, report[i]); },
    });
    const reportedYears = report.filter((r) => r.reported).length;
    if (!reportedYears) status.show('warning', 'Every year was too cloudy for this area. Try a nearby spot.');
    else if (reportedYears < report.length) status.show('info', `Done. ${report.length - reportedYears} year(s) were too cloudy to report.`);
    else status.show('info', 'Done.');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('report').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  } catch (err) {
    if (err?.name !== 'AbortError') console.error(err);
    status.show(err?.name === 'AbortError' ? 'info' : 'error', errorMessage(err));
  } finally {
    state.busy = false;
    state.abort = null;
    controls.setBusy(false);
    controls.setSelection(state.centre, state.inside, false);
  }
}

export { state, search, controls, status, mapView };
