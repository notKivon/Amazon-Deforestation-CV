// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderModelView } from '../src/ui/model-view.js';
import { createViewer, scaleFor } from '../src/ui/viewer.js';
import { KNOWN_LIMITATIONS } from '../src/ui/model-info.js';

const grid = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }];
const img = { width: 256, height: 256, data: new Uint8ClampedArray(256 * 256 * 4) };
const tile = (cls, p, extra = {}) => ({ valid: true, cls, pForest: p, pNotForest: 1 - p, confidencePct: Math.round(1000 * Math.max(p, 1 - p)) / 10, loss: false, burn: false, dNbr: null, label: null, ...extra });
const report = [
  { year: 2024, window: 'base', extended: false, reported: true, coverPct: 100, tiles: [tile('forest', 0.97), tile('forest', 0.9), { valid: false, cls: null }, tile('forest', 0.8)] },
  { year: 2025, window: 'extended', extended: true, reported: true, coverPct: 66.7, tiles: [tile('not_forest', 0.123, { loss: true, burn: true, dNbr: 0.41, label: 'loss — burn detected' }), tile('forest', 0.9, { dNbr: 0.05 }), { valid: false, cls: null }, tile('forest', 0.8)] },
];
const scenes = report.map(() => ({ falsecolor: img, truecolor: img }));

beforeEach(() => {
  document.body.innerHTML = '<div id="viewer"></div><section id="model-view" hidden></section>';
  HTMLCanvasElement.prototype.getContext = () => null;
});

describe('side-by-side viewer', () => {
  it('shows true- and false-colour images, each with a scale bar', () => {
    createViewer(document.getElementById('viewer'), { report, scenes, grid });
    const panels = document.querySelectorAll('.scene-panel');
    expect(panels).toHaveLength(2);
    expect(panels[0].textContent).toMatch(/True colour/);
    expect(panels[1].textContent).toMatch(/False colour \(what the model sees\)/);
    expect([...document.querySelectorAll('.scale-label')].map((e) => e.textContent)).toEqual(['500 m', '500 m']); // 2 × 2 tiles = 2.56 km
  });

  it('picks a round scale distance that fits the area', () => {
    expect(scaleFor(2.56)).toMatchObject({ km: 0.5, label: '500 m' });
    expect(scaleFor(5.12)).toMatchObject({ km: 1, label: '1 km' });
    expect(scaleFor(10.24)).toMatchObject({ km: 2, label: '2 km' });
    expect(scaleFor(5.12).pct).toBeCloseTo(19.53, 2);
  });

  it('selecting a square shows confidence, probabilities, burn status, and both crops', () => {
    const v = createViewer(document.getElementById('viewer'), { report, scenes, grid });
    const picker = document.getElementById('tile-picker');
    picker.value = '0';
    picker.dispatchEvent(new Event('change'));
    expect(v.selected).toBe(0);
    const insp = document.querySelector('.inspector');
    expect(insp.querySelectorAll('canvas.crop')).toHaveLength(2);
    expect(insp.textContent).toContain('Not Forest, 87.7% confident');
    expect([...insp.querySelectorAll('.prob-value')].map((e) => e.textContent)).toEqual(['12.3%', '87.7%']);
    expect(insp.textContent).toMatch(/Burn detected \(dNBR 0\.41, above 0\.27\)\. This cannot tell wildfire from fire used to clear land\./);
  });

  it('a click on either image selects the same square', () => {
    const v = createViewer(document.getElementById('viewer'), { report, scenes, grid });
    const canvases = document.querySelectorAll('canvas.scene');
    for (const [k, c] of [...canvases].entries()) {
      c.width = 256; c.height = 256;
      c.getBoundingClientRect = () => ({ left: 0, top: 0, width: 512, height: 512 });
      c.dispatchEvent(new MouseEvent('click', { clientX: k === 0 ? 400 : 100, clientY: 400 }));
      expect(v.selected).toBe(k === 0 ? 3 : 2); // bottom-right, then bottom-left
    }
  });

  it('follows the year and explains unclassified squares', () => {
    const v = createViewer(document.getElementById('viewer'), { report, scenes, grid });
    v.select(2);
    expect(document.querySelector('.inspector').textContent).toMatch(/too much cloud or shadow/);
    v.setYear(0);
    v.select(1);
    expect(document.querySelector('.inspector').textContent).toContain('2024');
    expect(document.querySelector('.inspector').textContent).toMatch(/no earlier clear year/);
    expect(document.getElementById('tile-picker').options).toHaveLength(5);
  });
});

describe('model view section', () => {
  it('explains the false-colour image and shows the model info panel', () => {
    renderModelView(document.getElementById('model-view'));
    const text = document.body.textContent;
    expect(text).toContain('What the model sees');
    expect(text).toContain('MobileNet');
    expect(text).toContain('R = B11, G = B8A, B = B04');
    expect(text).toContain('141/143 (98.6%)');
    expect(text).toContain('126/143 (88%)');
    for (const k of ['Forest: green', 'Cleared land: pink / magenta', 'Water: dark blue', 'Burn scars: dark red / brown']) expect(text).toContain(k);
  });
});

describe('Known limitations', () => {
  it('match CLAUDE.md word for word (only first-letter case and the full stop added)', () => {
    const line = readFileSync('CLAUDE.md', 'utf8').split('\n').find((l) => l.startsWith('- Known limitations (must appear):'));
    const spec = line.replace('- Known limitations (must appear): ', '').replace(/\.$/, '').split('; ');
    expect(spec).toHaveLength(8);
    const norm = (s) => s.replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase());
    expect(KNOWN_LIMITATIONS.map(norm)).toEqual(spec.map(norm));
  });

  it('all appear on the page', () => {
    renderModelView(document.getElementById('model-view'));
    const items = [...document.querySelectorAll('.limitations li')].map((li) => li.textContent);
    expect(items).toEqual(KNOWN_LIMITATIONS);
  });
});
