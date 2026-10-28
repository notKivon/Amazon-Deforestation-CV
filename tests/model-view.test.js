// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderModelView } from '../src/ui/model-view.js';
import { KNOWN_LIMITATIONS } from '../src/ui/model-info.js';

const grid = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }];
const img = { width: 256, height: 256, data: new Uint8ClampedArray(256 * 256 * 4) };
const tile = (cls, p, extra = {}) => ({ valid: true, cls, pForest: p, pNotForest: 1 - p, confidencePct: Math.round(1000 * Math.max(p, 1 - p)) / 10, loss: false, burn: false, dNbr: null, label: null, ...extra });
const report = [
  { year: 2024, window: 'base', extended: false, reported: true, tiles: [tile('forest', 0.97), tile('forest', 0.9), { valid: false, cls: null }, tile('forest', 0.8)] },
  { year: 2025, window: 'extended', extended: true, reported: true, tiles: [tile('not_forest', 0.123, { loss: true, burn: true, dNbr: 0.41, label: 'loss — burn detected' }), tile('forest', 0.9, { dNbr: 0.05 }), { valid: false, cls: null }, tile('forest', 0.8)] },
];
const scenes = report.map(() => ({ falsecolor: img, truecolor: img }));

beforeEach(() => {
  document.body.innerHTML = '<section id="model-view" hidden></section>';
  HTMLCanvasElement.prototype.getContext = () => null;
});

describe('model view', () => {
  it('inspects a tile: both crops, probabilities, and burn status', () => {
    const section = document.getElementById('model-view');
    renderModelView(section, { report, scenes, grid });
    expect(section.hidden).toBe(false);
    const picker = section.querySelector('#tile-picker');
    picker.value = '0';
    picker.dispatchEvent(new Event('change'));
    const insp = section.querySelector('.inspector');
    expect(insp.querySelectorAll('canvas.crop')).toHaveLength(2);
    expect(insp.textContent).toContain('Not Forest, 87.7% confident');
    expect([...insp.querySelectorAll('.prob-value')].map((e) => e.textContent)).toEqual(['12.3%', '87.7%']);
    expect(insp.textContent).toMatch(/Burn detected \(dNBR 0\.41, above 0\.27\)\. This cannot tell wildfire from fire used to clear land\./);
  });

  it('follows the year slider and explains unclassified tiles', () => {
    const section = document.getElementById('model-view');
    const v = renderModelView(section, { report, scenes, grid });
    v.select(2);
    expect(section.querySelector('.inspector').textContent).toMatch(/too much cloud or shadow/);
    v.setYear(0);
    v.select(1);
    expect(section.querySelector('.inspector').textContent).toContain('2024');
    expect(section.querySelector('.inspector').textContent).toMatch(/no earlier clear year/);
    expect(section.querySelector('#tile-picker').options).toHaveLength(5);
  });

  it('shows the model info panel', () => {
    renderModelView(document.getElementById('model-view'), { report, scenes, grid });
    const text = document.body.textContent;
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
    renderModelView(document.getElementById('model-view'), { report, scenes, grid });
    const items = [...document.querySelectorAll('.limitations li')].map((li) => li.textContent);
    expect(items).toEqual(KNOWN_LIMITATIONS);
  });
});
