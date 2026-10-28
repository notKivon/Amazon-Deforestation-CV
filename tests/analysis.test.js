import { describe, it, expect } from 'vitest';
import { tileValidity, validTileShare, tileNbr, buildReport, decodeNbr } from '../src/analysis/report.js';

const F = (p = 0.9) => ({ pForest: p, pNotForest: 1 - p });
const N = (p = 0.1) => ({ pForest: p, pNotForest: 1 - p });
const year = (y, { validity, probs, nbr, window = 'base' }) => ({
  year: y, window, validity, probs, nbr: nbr ?? probs.map(() => 0.5),
});

// 2 × 2 tile nbr image (256 px) from per-tile { validFrac, r }.
function nbrImage(tiles) {
  const w = 256, data = new Uint8ClampedArray(w * w * 4);
  tiles.forEach(({ validFrac, r }, t) => {
    const row = Math.floor(t / 2), col = t % 2;
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const i = ((row * 128 + y) * w + col * 128 + x) * 4;
      data[i] = r;
      data[i + 1] = (y * 128 + x) / (128 * 128) < validFrac ? 255 : 0;
    }
  });
  return { width: w, height: w, data };
}
const GRID = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }];

describe('tileValidity / tileNbr', () => {
  it('measures valid-pixel fraction per tile and the 70% tile rule', () => {
    const img = nbrImage([{ validFrac: 1, r: 200 }, { validFrac: 0.7, r: 200 }, { validFrac: 0.69, r: 200 }, { validFrac: 0, r: 200 }]);
    const v = tileValidity(img, GRID);
    expect(v[0]).toBe(1);
    expect(v[1]).toBeCloseTo(0.7, 3);
    expect(v[3]).toBe(0);
    expect(validTileShare(v)).toBe(0.5); // tiles 0 and 1 (≥ 0.7)
  });

  it('averages decoded NBR over valid pixels only', () => {
    const img = nbrImage([{ validFrac: 1, r: 191 }, { validFrac: 0.5, r: 64 }, { validFrac: 0, r: 0 }, { validFrac: 1, r: 128 }]);
    const n = tileNbr(img, GRID);
    expect(n[0]).toBeCloseTo(decodeNbr(191), 6);
    expect(n[1]).toBeCloseTo(decodeNbr(64), 6);
    expect(n[2]).toBeNull();
  });
});

describe('buildReport', () => {
  it('excludes a cloudy tile from that year\'s statistics', () => {
    const [r] = buildReport([year(2020, { validity: [1, 1, 1, 0.2], probs: [F(), F(), N(), F()] })]);
    expect(r.reported).toBe(true);
    expect(r.validCount).toBe(3);
    expect(r.forestCount).toBe(2);
    expect(r.coverPct).toBe(66.7);
    expect(r.tiles[3]).toEqual({ valid: false, cls: null });
  });

  it('a year with < 50% valid tiles is too cloudy (no cover value); exactly 50% is reported', () => {
    const [cloudy, half] = buildReport([
      year(2020, { validity: [1, 0, 0, 0], probs: [F(), null, null, null] }),
      year(2021, { validity: [1, 1, 0, 0], probs: [F(), N(), null, null] }),
    ]);
    expect(cloudy.reported).toBe(false);
    expect(cloudy.coverPct).toBeNull();
    expect(half.reported).toBe(true);
    expect(half.coverPct).toBe(50);
  });

  it('flags loss against the previous valid year, across a too-cloudy gap year and a cloudy tile', () => {
    const r = buildReport([
      year(2019, { validity: [1, 1, 1, 1], probs: [F(), F(), F(), N()] }),
      year(2020, { validity: [0, 0, 0, 1], probs: [null, null, null, N()] }), // too cloudy
      year(2021, { validity: [1, 0, 1, 1], probs: [N(), null, F(), N()] }), // tile 1 cloudy
      year(2022, { validity: [1, 1, 1, 1], probs: [N(), N(), F(), N()] }),
    ]);
    expect(r[1].reported).toBe(false);
    expect(r[2].tiles.map((t) => t.loss ?? null)).toEqual([true, null, false, false]);
    // Tile 1: Forest in 2019, cloudy in 2020 and 2021, Not Forest in 2022 → loss in 2022.
    expect(r[3].tiles.map((t) => t.loss)).toEqual([false, true, false, false]);
    expect(r[3].lossCount).toBe(1);
  });

  it('burn threshold: dNBR exactly 0.27 is not flagged, 0.28 is', () => {
    const probs = [F(), F(), F(), F()];
    const r = buildReport([
      year(2020, { validity: [1, 1, 1, 1], probs, nbr: [0.6, 0.6, 0.6, 0.6] }),
      year(2021, { validity: [1, 1, 1, 1], probs, nbr: [0.6 - 0.27, 0.6 - 0.28, 0.6, null] }),
    ]);
    expect(r[1].tiles[0].burn).toBe(false);
    expect(r[1].tiles[0].dNbr).toBeCloseTo(0.27, 9);
    expect(r[1].tiles[1].burn).toBe(true);
    expect(r[1].tiles[1].label).toBe('burn detected');
    expect(r[1].tiles[3].burn).toBe(false); // no NBR → no dNBR
    expect(r[1].burnCount).toBe(1);
  });

  it('dNBR of exactly 0.27 is never flagged, whatever the base NBR (float noise)', () => {
    for (let a = 0; a <= 254; a++) {
      const p = a / 127.5 - 1;
      const r = buildReport([
        year(2020, { validity: [1], probs: [F()], nbr: [p] }),
        year(2021, { validity: [1], probs: [F()], nbr: [p - 0.27] }),
      ]);
      expect(r[1].tiles[0].burn).toBe(false);
    }
  });

  it('throws if a valid tile in a reported year has no probabilities', () => {
    expect(() => buildReport([year(2020, { validity: [1, 1], probs: [F(), null] })])).toThrow(/not classified/);
  });

  it('labels loss with burn and reports confidence of the predicted class to 1 dp', () => {
    const r = buildReport([
      year(2020, { validity: [1, 1], probs: [F(0.97), F(0.5)], nbr: [0.6, 0.6] }),
      year(2021, { validity: [1, 1], probs: [N(0.1234), N(0.4999)], nbr: [-0.1, 0.55] }),
    ]);
    expect(r[1].tiles[0]).toMatchObject({ loss: true, burn: true, label: 'loss — burn detected', confidencePct: 87.7 });
    expect(r[0].tiles[1]).toMatchObject({ cls: 'forest', confidencePct: 50 }); // P = 0.5 → Forest
    expect(r[1].tiles[1]).toMatchObject({ loss: true, burn: false, label: 'loss' });
  });

  it('carries the window and extended flag through', () => {
    const [r] = buildReport([year(2023, { validity: [1, 1], probs: [F(), F()], window: 'extended' })]);
    expect(r).toMatchObject({ window: 'extended', extended: true, coverPct: 100 });
  });
});
