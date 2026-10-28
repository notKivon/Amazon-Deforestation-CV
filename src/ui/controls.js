// Area controls: size select (2–8 tiles per side, in km), zone/season label, Run button.
import { h } from './dom.js';
import { zoneFor } from '../geo/season.js';
import { MIN_TILES_PER_SIDE, MAX_TILES_PER_SIDE, TILE_M } from '../geo/grid.js';
import { OUTSIDE_AMAZON } from './status.js';

export const DEFAULT_TILES = 4;
const ZONE_TEXT = {
  south: 'South zone: dry season Jun–Aug (widened to May–Sep when too cloudy)',
  north: 'North zone: dry season Dec–Mar (widened to Nov–Apr when too cloudy)',
};

export function sizeLabel(n) {
  const km = (n * TILE_M) / 1000;
  return `${n} × ${n} tiles (${km.toFixed(2)} km)`;
}

export function createControls(container, { onSizeChange = () => {}, onRun = () => {} } = {}) {
  const select = h('select', { id: 'tiles-per-side', onchange: () => onSizeChange(Number(select.value)) });
  for (let n = MIN_TILES_PER_SIDE; n <= MAX_TILES_PER_SIDE; n++) {
    select.append(h('option', { value: n, selected: n === DEFAULT_TILES }, sizeLabel(n)));
  }
  const where = h('p', { class: 'selection' }, 'Click the map or search to choose a centre point.');
  const zone = h('p', { class: 'zone', hidden: true });
  const outside = h('p', { class: 'outside-msg', role: 'alert', hidden: true }, OUTSIDE_AMAZON);
  const run = h('button', { type: 'button', class: 'run', disabled: true, onclick: () => onRun() }, 'Run analysis');

  container.append(
    h('label', { for: 'tiles-per-side' }, 'Area size'),
    select, where, zone, outside, run,
  );

  return {
    get tilesPerSide() {
      return Number(select.value);
    },
    /** centre: { lon, lat, name? } or null; inside: whether the area passes the Amazon check. */
    setSelection(centre, inside, busy = false) {
      if (!centre) {
        zone.hidden = true;
        outside.hidden = true;
        run.disabled = true;
        return;
      }
      where.textContent = `Centre: ${centre.name ? `${centre.name} — ` : ''}${centre.lat.toFixed(4)}, ${centre.lon.toFixed(4)}`;
      zone.hidden = false;
      zone.textContent = ZONE_TEXT[zoneFor(centre.lat)];
      outside.hidden = inside;
      run.disabled = !inside || busy;
    },
    setBusy(busy) {
      select.disabled = busy;
      run.textContent = busy ? 'Running…' : 'Run analysis';
      if (busy) run.disabled = true;
    },
  };
}
