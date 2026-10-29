// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runPipeline } from '../src/app/pipeline.js';
import { renderReport, PLAY_STEP_MS } from '../src/ui/report.js';
import { chartConfig } from '../src/ui/chart.js';

const grid = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }];

// 256 px nbr image; validFrac per tile.
function nbrImage(valid) {
  const w = 256, data = new Uint8ClampedArray(w * w * 4);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const t = (y >= 128 ? 2 : 0) + (x >= 128 ? 1 : 0), i = (y * w + x) * 4;
    data[i] = 204; // NBR 0.6
    data[i + 1] = valid[t] ? 255 : 0;
  }
  return { width: w, height: w, data };
}
const blank = { width: 256, height: 256, data: new Uint8ClampedArray(256 * 256 * 4) };

describe('runPipeline', () => {
  it('classifies only valid tiles of reported years and builds the report', async () => {
    const scenes = [
      { year: 2024, window: 'base', nbr: nbrImage([1, 1, 1, 0]), falsecolor: blank, truecolor: blank },
      { year: 2025, window: 'extended', nbr: nbrImage([1, 0, 0, 0]), falsecolor: blank, truecolor: blank },
    ];
    const classifyScene = vi.fn(async (loaded, img, g, include) =>
      g.map((_, i) => (include(i) ? { pForest: 0.9, pNotForest: 0.1 } : null)));
    const progress = [];
    const out = await runPipeline({
      area: {}, grid, years: [2024, 2025],
      deps: { client: { fetchYears: async () => scenes }, loadModel: async () => ({}), classifyScene },
      onProgress: (p) => progress.push(p),
    });
    expect(classifyScene).toHaveBeenCalledTimes(1); // 2025 too cloudy → not classified
    expect(out.report[0]).toMatchObject({ reported: true, validCount: 3, coverPct: 100 });
    expect(out.report[1]).toMatchObject({ reported: false, coverPct: null, extended: true });
    expect(progress.at(-1)).toEqual({ phase: 'classify', done: 2, total: 2 });
  });

  it('surfaces a model load failure', async () => {
    await expect(runPipeline({
      area: {}, grid, years: [],
      deps: { client: { fetchYears: async () => [] }, loadModel: async () => { throw new Error('no model'); }, classifyScene: vi.fn() },
    })).rejects.toThrow('no model');
  });
});

const tile = (cls, extra = {}) => ({ valid: true, cls, pForest: cls === 'forest' ? 0.9 : 0.1, pNotForest: cls === 'forest' ? 0.1 : 0.9, confidencePct: 90, loss: false, burn: false, label: null, ...extra });
const report = [
  { year: 2023, window: 'base', extended: false, reported: true, tileCount: 4, validCount: 4, coverPct: 100, forestCount: 4, notForestCount: 0, lossCount: 0, burnCount: 0, tiles: [tile('forest'), tile('forest'), tile('forest'), tile('forest')] },
  { year: 2024, window: 'extended', extended: true, reported: false, tileCount: 4, validCount: 1, coverPct: null, forestCount: 0, notForestCount: 0, lossCount: 0, burnCount: 0, tiles: grid.map(() => ({ valid: false, cls: null })) },
  { year: 2025, window: 'extended', extended: true, reported: true, tileCount: 4, validCount: 4, coverPct: 75, forestCount: 3, notForestCount: 1, lossCount: 1, burnCount: 1, tiles: [tile('not_forest', { loss: true, burn: true, label: 'loss — burn detected' }), tile('forest'), tile('forest'), tile('forest')] },
];

describe('renderReport', () => {
  beforeEach(() => {
    document.body.innerHTML = '<section id="report" hidden></section>';
    HTMLCanvasElement.prototype.getContext = () => null; // jsdom has no canvas
  });

  it('renders summary, table with windows and too-cloudy gaps, and drives the year', () => {
    const section = document.getElementById('report');
    const onYearChange = vi.fn();
    const createChart = vi.fn(() => ({ destroy() {} }));
    const scenes = report.map((r) => ({ year: r.year, truecolor: blank, falsecolor: blank }));
    const v = renderReport(section, { report, scenes, grid, zone: 'south' }, { createChart, onYearChange });
    expect(section.hidden).toBe(false);
    expect(section.querySelector('.summary').textContent).toBe('Forest cover went from 100.0% in 2023 to 75.0% in 2025 (-25.0 points).');
    const rows = [...section.querySelectorAll('.counts tbody tr')].map((r) => [...r.children].map((c) => c.textContent));
    expect(rows[1]).toEqual(['2024', 'extended window', '1 / 4', '—', '—', 'too cloudy', '—', '—']);
    expect(rows[2]).toEqual(['2025', 'extended window', '4 / 4', '3', '1', '75.0%', '1', '1']);
    expect(onYearChange).toHaveBeenLastCalledWith(2);
    expect(section.querySelector('.dates').textContent).toMatch(/1 May 2025 to 30 Sept? 2025/);
    expect(section.textContent).toContain('A burn flag cannot tell wildfire from fire used to clear land.');

    v.slider.value = '0';
    v.slider.dispatchEvent(new Event('input'));
    expect(onYearChange).toHaveBeenLastCalledWith(0);
    expect(section.querySelector('.year-label').textContent).toBe('2023');
    expect(section.querySelector('.dates').textContent).toMatch(/1 Jun 2023 to 31 Aug 2023/);
    expect(section.querySelector('tr.current th').textContent).toBe('2023');
    expect(createChart).toHaveBeenCalledOnce();
  });
});

describe('renderReport play button', () => {
  beforeEach(() => {
    document.body.innerHTML = '<section id="report" hidden></section>';
    HTMLCanvasElement.prototype.getContext = () => null;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());
  const data = () => ({ report, scenes: report.map(() => ({ truecolor: blank, falsecolor: blank })), grid, zone: 'south' });

  it('restarts from the first year at the end, steps each year, and stops on the last', () => {
    const onYearChange = vi.fn();
    const v = renderReport(document.getElementById('report'), data(), { onYearChange });
    expect(v.slider.value).toBe('2');
    v.play.click(); // at the last year → jumps to the first and plays
    expect(v.slider.value).toBe('0');
    expect(v.play.textContent).toMatch(/Pause/);
    vi.advanceTimersByTime(PLAY_STEP_MS);
    expect(v.slider.value).toBe('1');
    vi.advanceTimersByTime(PLAY_STEP_MS);
    expect(v.slider.value).toBe('2');
    expect(v.play.textContent).toMatch(/Play/);
    vi.advanceTimersByTime(PLAY_STEP_MS * 3);
    expect(v.slider.value).toBe('2');
    expect(onYearChange).toHaveBeenLastCalledWith(2);
  });

  it('pauses when pressed again or when the slider is moved by hand', () => {
    const v = renderReport(document.getElementById('report'), data(), {});
    v.play.click();
    v.play.click();
    vi.advanceTimersByTime(PLAY_STEP_MS * 2);
    expect(v.slider.value).toBe('0');
    v.play.click();
    v.slider.value = '1';
    v.slider.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(PLAY_STEP_MS * 2);
    expect(v.slider.value).toBe('1');
    expect(v.play.textContent).toMatch(/Play/);
  });
});

describe('renderReport chart lifecycle', () => {
  beforeEach(() => {
    document.body.innerHTML = '<section id="report" hidden></section>';
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  const data = () => ({ report, scenes: report.map(() => ({ truecolor: blank, falsecolor: blank })), grid, zone: 'south' });

  it('destroys a lazily loaded chart that arrives after destroy()', async () => {
    const chart = { destroy: vi.fn() };
    let resolve;
    const v = renderReport(document.getElementById('report'), data(), { createChart: () => new Promise((r) => { resolve = r; }) });
    v.destroy();
    resolve(chart);
    await new Promise((r) => setTimeout(r, 0));
    expect(chart.destroy).toHaveBeenCalledOnce();
  });

  it('shows a note if the chart cannot load', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderReport(document.getElementById('report'), data(), { createChart: () => Promise.reject(new Error('chunk failed')) });
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('.chart-box').textContent).toMatch(/chart could not be loaded/);
    err.mockRestore();
  });
});

describe('chartConfig', () => {
  it('leaves gaps for too-cloudy years and draws extended years hollow', () => {
    const ds = chartConfig(report).data.datasets[0];
    expect(ds.data).toEqual([100, null, 75]);
    expect(ds.spanGaps).toBe(false);
    expect(ds.pointBackgroundColor[2]).toBe('#ffffff');
    expect(ds.pointBackgroundColor[0]).not.toBe('#ffffff');
  });
});
