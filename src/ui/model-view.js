// "What the model sees": false-colour scene with the tile grid and a tile inspector
// (both crops at 4×, P(Forest) / P(Not Forest), burn status).
import { h } from './dom.js';
import { drawScene, tileAt, describeTile } from './tiles.js';
import { cropTile } from '../model/crop.js';
import { modelInfo } from './model-info.js';

const pct = (p) => `${(100 * p).toFixed(1)}%`;

function cropCanvas(image, t, label) {
  const crop = cropTile(image, t.row, t.col);
  const c = h('canvas', { class: 'crop', width: crop.width, height: crop.height, role: 'img', 'aria-label': label });
  c.getContext('2d')?.putImageData(new ImageData(crop.data, crop.width, crop.height), 0, 0);
  return c;
}

function bar(label, p, cls) {
  return h('div', { class: 'prob' },
    h('span', { class: 'prob-label' }, label),
    h('span', { class: 'prob-track' }, h('span', { class: `prob-fill ${cls}`, style: { width: pct(p) } })),
    h('span', { class: 'prob-value' }, pct(p)));
}

function burnText(tile) {
  if (tile.dNbr == null) return 'Burn check: no earlier clear year to compare with.';
  const d = `dNBR ${tile.dNbr.toFixed(2)}`;
  return tile.burn
    ? `Burn detected (${d}, above 0.27). This cannot tell wildfire from fire used to clear land.`
    : `No burn detected (${d}; a burn needs more than 0.27).`;
}

export function renderModelView(section, { report, scenes, grid }) {
  let yearIndex = report.length - 1, selected = null;
  const scene = h('canvas', { class: 'scene', role: 'img' });
  const yearTitle = h('p', { class: 'dates' });
  const picker = h('select', { id: 'tile-picker' });
  const inspector = h('div', { class: 'inspector', 'aria-live': 'polite' });

  section.replaceChildren(
    h('h2', { id: 'model-title' }, 'What the model sees'),
    h('p', {}, 'The model never sees the true-colour picture. It sees this false-colour image, made from short-wave infrared (B11), narrow near-infrared (B8A), and red (B04). Healthy forest is green, cleared land is pink or magenta. Click a tile, or choose one from the list, to see its two crops and the model\'s confidence.'),
    yearTitle,
    h('div', { class: 'model-grid' },
      h('div', { class: 'scene-box' }, scene),
      h('div', {}, h('label', { for: 'tile-picker' }, 'Tile'), picker, inspector)),
    modelInfo(),
  );
  section.hidden = false;

  function fillPicker() {
    const r = report[yearIndex];
    picker.replaceChildren(h('option', { value: '' }, 'Choose a tile…'),
      ...grid.map((t, i) => h('option', { value: i, selected: i === selected },
        `Row ${t.row + 1}, column ${t.col + 1}: ${r.reported ? describeTile(r.tiles[i]) : 'year too cloudy'}`)));
  }

  function inspect() {
    const r = report[yearIndex], s = scenes[yearIndex];
    if (selected == null) {
      inspector.replaceChildren(h('p', { class: 'note' }, 'No tile selected.'));
      return;
    }
    const t = grid[selected], tile = r.reported ? r.tiles[selected] : null;
    const crops = h('div', { class: 'crops' },
      h('figure', {}, cropCanvas(s.falsecolor, t, 'False-colour crop (what the model sees)'), h('figcaption', {}, 'False colour (model input)')),
      h('figure', {}, cropCanvas(s.truecolor, t, 'True-colour crop'), h('figcaption', {}, 'True colour')));
    const head = h('h3', {}, `${r.year} · row ${t.row + 1}, column ${t.col + 1}`);
    if (!tile?.valid) {
      inspector.replaceChildren(head, crops, h('p', {}, r.reported
        ? 'Not classified: too much cloud or shadow on this tile this year.'
        : 'Not classified: this year was too cloudy to report.'));
      return;
    }
    inspector.replaceChildren(head, crops,
      h('p', { class: 'verdict' }, `${tile.cls === 'forest' ? 'Forest' : 'Not Forest'}, ${tile.confidencePct.toFixed(1)}% confident${tile.loss ? ' — forest loss since the previous clear year' : ''}`),
      bar('P(Forest)', tile.pForest, 'fill-forest'),
      bar('P(Not Forest)', tile.pNotForest, 'fill-cleared'),
      h('p', {}, burnText(tile)));
  }

  function draw() {
    const r = report[yearIndex];
    yearTitle.textContent = `${r.year}${r.extended ? ' (extended window)' : ''}${r.reported ? '' : ' — too cloudy to report'}. Move the year slider above to change year.`;
    scene.setAttribute('aria-label', `False-colour image for ${r.year} with the tile grid.`);
    drawScene(scene, scenes[yearIndex].falsecolor, grid, r.reported ? r : null, { selected });
  }

  function select(i) {
    selected = i;
    draw();
    fillPicker();
    inspect();
  }

  scene.addEventListener('click', (e) => { const i = tileAt(scene, e, grid); if (i != null) select(i); });
  picker.addEventListener('change', () => select(picker.value === '' ? null : Number(picker.value)));

  function setYear(i) {
    yearIndex = i;
    draw();
    fillPicker();
    inspect();
  }
  setYear(yearIndex);
  return { setYear, select };
}
