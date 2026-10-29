// Detail for the selected tile: both crops at 4×, verdict with confidence, P(Forest) /
// P(Not Forest) bars, and burn status.
import { h } from './dom.js';
import { cropTile } from '../model/crop.js';

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

export function burnText(tile) {
  if (tile.dNbr == null) return 'Burn check: no earlier clear year to compare with.';
  const d = `dNBR ${tile.dNbr.toFixed(2)}`;
  return tile.burn
    ? `Burn detected (${d}, above 0.27). This cannot tell wildfire from fire used to clear land.`
    : `No burn detected (${d}; a burn needs more than 0.27).`;
}

/** Fills `el` with the detail for tile `index` of year report `r` (scene `s`), or a hint. */
export function renderInspector(el, { r, s, grid, index }) {
  if (index == null) {
    el.replaceChildren(h('p', { class: 'note' }, 'Click a square on either image, or choose one from the list, to see its details.'));
    return;
  }
  const t = grid[index], tile = r.reported ? r.tiles[index] : null;
  const head = h('h3', {}, `${r.year} · row ${t.row + 1}, column ${t.col + 1}`);
  const crops = h('div', { class: 'crops' },
    h('figure', {}, cropCanvas(s.truecolor, t, 'True-colour crop'), h('figcaption', {}, 'True colour')),
    h('figure', {}, cropCanvas(s.falsecolor, t, 'False-colour crop (what the model sees)'), h('figcaption', {}, 'False colour (model input)')));
  if (!tile?.valid) {
    el.replaceChildren(head, h('p', {}, r.reported
      ? 'Not classified: too much cloud or shadow on this tile this year.'
      : 'Not classified: this year was too cloudy to report.'), crops);
    return;
  }
  el.replaceChildren(head,
    h('p', { class: 'verdict' }, `${tile.cls === 'forest' ? 'Forest' : 'Not Forest'}, ${tile.confidencePct.toFixed(1)}% confident${tile.loss ? ' — forest loss since the previous clear year' : ''}`),
    bar('P(Forest)', tile.pForest, 'fill-forest'),
    bar('P(Not Forest)', tile.pNotForest, 'fill-cleared'),
    h('p', { class: tile.burn ? 'burn-status burn-yes' : 'burn-status' }, burnText(tile)),
    crops);
}
