// The year's true-colour and false-colour images side by side, each with the tile grid and a
// scale bar. Selecting a tile on either image (or from the list) highlights it on both and
// shows it in the inspector.
import { h } from './dom.js';
import { drawScene, tileAt, describeTile } from './tiles.js';
import { renderInspector } from './inspector.js';
import { TILE_M } from '../geo/grid.js';

const SCALE_STEPS_KM = [0.5, 1, 2, 5];

/** Largest round distance that fits in ~30% of the image width. */
export function scaleFor(sideKm) {
  const km = SCALE_STEPS_KM.filter((k) => k <= sideKm * 0.3).at(-1) ?? SCALE_STEPS_KM[0];
  return { km, pct: (100 * km) / sideKm, label: km < 1 ? `${km * 1000} m` : `${km} km` };
}

function scaleBar(sideKm) {
  const { pct, label } = scaleFor(sideKm);
  return h('div', { class: 'scale', 'aria-hidden': 'true' },
    h('span', { class: 'north' }, 'N ↑'),
    h('span', { class: 'scale-bar', style: { width: `${pct}%` } }),
    h('span', { class: 'scale-label' }, label));
}

export function createViewer(container, { report, scenes, grid }) {
  const side = Math.round(Math.sqrt(grid.length));
  const sideKm = (side * TILE_M) / 1000;
  let yearIndex = report.length - 1, selected = null, showGrid = true;

  const panels = ['truecolor', 'falsecolor'].map((product) => {
    const canvas = h('canvas', { class: 'scene', role: 'img' });
    canvas.addEventListener('click', (e) => { const i = tileAt(canvas, e, grid); if (i != null) select(i); });
    const caption = product === 'truecolor'
      ? 'True colour (what you would see)'
      : 'False colour (what the model sees)';
    const figure = h('figure', { class: 'scene-panel' },
      h('div', { class: 'scene-wrap' }, canvas, scaleBar(sideKm)),
      h('figcaption', {}, caption));
    return { product, canvas, figure };
  });
  const picker = h('select', { id: 'tile-picker' });
  const inspector = h('div', { class: 'inspector', 'aria-live': 'polite' });

  container.replaceChildren(
    h('div', { class: 'scene-pair' }, panels.map((p) => p.figure)),
    h('div', { class: 'picker-row' }, h('label', { for: 'tile-picker' }, 'Square'), picker),
    inspector,
  );
  picker.addEventListener('change', () => select(picker.value === '' ? null : Number(picker.value)));

  function draw() {
    const r = report[yearIndex], s = scenes[yearIndex];
    for (const p of panels) {
      p.canvas.setAttribute('aria-label', `${p.product === 'truecolor' ? 'True' : 'False'}-colour image for ${r.year}${r.reported ? `, ${r.coverPct.toFixed(1)}% forest` : ', too cloudy'}.`);
      drawScene(p.canvas, s[p.product], grid, r.reported ? r : null, { grid: showGrid, selected });
    }
    picker.replaceChildren(h('option', { value: '' }, 'Choose a square…'),
      ...grid.map((t, i) => h('option', { value: i, selected: i === selected },
        `Row ${t.row + 1}, column ${t.col + 1}: ${r.reported ? describeTile(r.tiles[i]) : 'year too cloudy'}`)));
    renderInspector(inspector, { r, s, grid, index: selected });
  }

  function select(i) {
    selected = i;
    draw();
  }

  draw();
  return {
    setYear(i) { yearIndex = i; draw(); },
    setGrid(on) { showGrid = on; draw(); },
    select,
    get selected() { return selected; },
  };
}
