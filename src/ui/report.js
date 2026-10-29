// Report section: cover chart, year slider, side-by-side scene viewer, counts table.
import { h } from './dom.js';
import { TILE_COLOURS, SELECTED_COLOUR, LOSS_MARK, BURN_MARK } from './tiles.js';
import { createViewer } from './viewer.js';
import { windowFor } from '../geo/season.js';

export const PLAY_STEP_MS = 1200;

const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function legend() {
  return h('ul', { class: 'legend' },
    h('li', {}, h('span', { class: 'swatch', style: { borderColor: TILE_COLOURS.forest } }), 'Forest'),
    h('li', {}, h('span', { class: 'swatch', style: { borderColor: TILE_COLOURS.not_forest } }), 'Not Forest'),
    h('li', {}, h('span', { class: 'swatch swatch-hatch' }), 'No data (cloud, shadow) — not counted'),
    h('li', {}, h('span', { class: 'mark' }, LOSS_MARK), 'Forest loss since the previous clear year'),
    h('li', {}, h('span', { class: 'mark' }, BURN_MARK), 'Burn detected (dNBR > 0.27)'),
    h('li', {}, h('span', { class: 'swatch swatch-selected', style: { borderColor: SELECTED_COLOUR } }), 'Selected square (yellow outline)'),
  );
}

/**
 * section: #report; data: { report, scenes, grid, zone }; deps: { createChart };
 * onYearChange(index) fires when the slider moves.
 */
export function renderReport(section, data, { createChart, onYearChange = () => {} } = {}) {
  const { report, scenes, grid, zone } = data;
  const reported = report.filter((r) => r.reported);
  const first = reported[0], last = reported.at(-1);
  const summary = !reported.length
    ? 'Every year was too cloudy to report for this area.'
    : first === last
      ? `${first.year}: ${first.coverPct.toFixed(1)}% forest.`
      : `Forest cover went from ${first.coverPct.toFixed(1)}% in ${first.year} to ${last.coverPct.toFixed(1)}% in ${last.year} (${(last.coverPct - first.coverPct >= 0 ? '+' : '')}${(last.coverPct - first.coverPct).toFixed(1)} points).`;

  const chartCanvas = h('canvas', { role: 'img', 'aria-label': `Line chart of forest cover by year. ${summary}` });
  const slider = h('input', { type: 'range', id: 'year-slider', min: 0, max: report.length - 1, step: 1, value: report.length - 1 });
  const yearLabel = h('output', { for: 'year-slider', class: 'year-label' });
  const play = h('button', { type: 'button', class: 'play', 'aria-label': 'Play through the years' }, '▶ Play');
  const dates = h('p', { class: 'dates' });
  const gridToggle = h('input', { type: 'checkbox', id: 'grid-toggle', checked: true });
  const viewerBox = h('div', { class: 'viewer' });
  const rows = report.map((r) => h('tr', {},
    h('th', { scope: 'row' }, r.year),
    h('td', {}, r.extended ? 'extended window' : 'base'),
    h('td', {}, `${r.validCount} / ${r.tileCount}`),
    h('td', {}, r.reported ? r.forestCount : '—'),
    h('td', {}, r.reported ? r.notForestCount : '—'),
    h('td', {}, r.reported ? `${r.coverPct.toFixed(1)}%` : 'too cloudy'),
    h('td', {}, r.reported ? r.lossCount : '—'),
    h('td', {}, r.reported ? r.burnCount : '—'),
  ));

  section.replaceChildren(
    h('h2', { id: 'report-title' }, 'Forest cover report'),
    h('p', { class: 'summary' }, summary),
    h('div', { class: 'chart-box' }, chartCanvas),
    h('p', { class: 'note' }, 'Filled points use the normal dry-season window. Hollow points are "extended window" years: the base window was too cloudy, so a window one month wider on each side was used. Gaps are years too cloudy to report.'),
    h('div', { class: 'year-row' }, h('label', { for: 'year-slider' }, 'Year'), play, slider, yearLabel),
    dates,
    h('label', { class: 'toggle' }, gridToggle, ' Show tile grid'),
    legend(),
    viewerBox,
    h('p', { class: 'note' }, 'A burn flag cannot tell wildfire from fire used to clear land.'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'counts' },
      h('caption', {}, 'Tile counts per year'),
      h('thead', {}, h('tr', {}, ...['Year', 'Window', 'Valid tiles', 'Forest', 'Not forest', 'Cover', 'Loss', 'Burn'].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, rows),
    )),
  );
  section.hidden = false;
  const viewer = createViewer(viewerBox, { report, scenes, grid });
  // createChart may return the chart or a promise of it (lazy-loaded Chart.js).
  let chart = null, destroyed = false;
  Promise.resolve(createChart?.(chartCanvas, report)).then((c) => {
    if (destroyed) c?.destroy?.();
    else chart = c ?? null;
  }).catch((err) => {
    console.error(err);
    chartCanvas.replaceWith(h('p', { class: 'note' }, 'The chart could not be loaded; the table below has the same numbers.'));
  });

  function show(i) {
    const r = report[i];
    const w = windowFor(zone, r.year, r.window);
    yearLabel.textContent = `${r.year}${r.extended ? ' (extended window)' : ''}`;
    slider.setAttribute('aria-valuetext', `${r.year}${r.reported ? `, ${r.coverPct.toFixed(1)}% forest` : ', too cloudy'}`);
    dates.textContent = `Images from ${fmtDate(w.from)} to ${fmtDate(w.to)} (least-cloudy pixels in that window).${r.reported ? '' : ' Too cloudy to report this year.'}`;
    viewer.setYear(i);
    rows.forEach((row, k) => row.classList.toggle('current', k === i));
    onYearChange(i);
  }
  // Play: step one year at a time and stop on the last year. Pressing Play on the last
  // year starts again from the first; moving the slider by hand pauses.
  let timer = null;
  function pause() {
    clearInterval(timer);
    timer = null;
    play.textContent = '▶ Play';
    play.setAttribute('aria-label', 'Play through the years');
  }
  function step() {
    const next = Number(slider.value) + 1;
    if (next > report.length - 1) return pause();
    slider.value = String(next);
    show(next);
    if (next === report.length - 1) pause();
  }
  play.addEventListener('click', () => {
    if (timer) return pause();
    if (Number(slider.value) >= report.length - 1) { slider.value = '0'; show(0); }
    timer = setInterval(step, PLAY_STEP_MS);
    play.textContent = '❚❚ Pause';
    play.setAttribute('aria-label', 'Pause');
  });
  slider.addEventListener('input', () => { pause(); show(Number(slider.value)); });
  gridToggle.addEventListener('change', () => viewer.setGrid(gridToggle.checked));
  show(report.length - 1);

  return { show, slider, viewer, get chart() { return chart; }, play, destroy: () => { destroyed = true; pause(); chart?.destroy(); } };
}
