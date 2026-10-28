// App wiring and state.
import './styles.css';
import { areaBox, boxCornersLatLon } from './geo/grid.js';
import { areaInsideAmazon } from './geo/region.js';
import { createMap } from './ui/map.js';
import { createSearch } from './ui/search.js';
import { createControls } from './ui/controls.js';
import { createStatus } from './ui/status.js';

const state = { centre: null, box: null, inside: false, busy: false };

const panel = document.getElementById('panel');
const search = createSearch(panel, { onChoose: (place) => select(place, true) });
const controls = createControls(panel, { onSizeChange: () => refresh(), onRun: () => run() });
const status = createStatus(panel);
const mapView = createMap(document.getElementById('map'), { onSelect: (p) => select(p, false) });

function select(point, fly) {
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
  status.clear();
}

async function run() {
  // Filled in by step 9 (report pipeline).
}

export { state, search, controls, status, mapView };
