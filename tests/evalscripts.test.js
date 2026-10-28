import { describe, it, expect } from 'vitest';
import { TRUECOLOR, FALSECOLOR, NBR } from '../shared/evalscripts.js';

// Load an evalscript's functions as Sentinel Hub would.
const load = (src) => new Function(`${src}; return { setup, evaluatePixel };`)();

// Independent float32 emulation of reference/build_dataset.py's to_rgb on an integer DN.
function pythonToRgb(dn) {
  const f = new Float32Array(1);
  f[0] = dn; f[0] = 2.5 * f[0]; f[0] = f[0] / 10000; f[0] = f[0] * 255;
  return Math.trunc(Math.min(255, Math.max(0, f[0])));
}

describe('falsecolor evalscript', () => {
  const fc = load(FALSECOLOR);
  it('uses B11, B8A, B04 as R, G, B in UINT8', () => {
    expect(fc.setup().input).toEqual(['B11', 'B8A', 'B04']);
    expect(fc.setup().output).toEqual({ bands: 3, sampleType: 'UINT8' });
    expect(fc.evaluatePixel({ B11: 0.1, B8A: 0.2, B04: 0.03 })).toEqual([63, 127, 19]);
  });
  it('matches the training to_rgb chain for every DN 0–20000', () => {
    for (let dn = 0; dn <= 20000; dn++) {
      const v = fc.evaluatePixel({ B11: dn / 10000, B8A: dn / 10000, B04: dn / 10000 });
      expect(v[0]).toBe(pythonToRgb(dn));
    }
  });
  it('clamps negative and very bright values', () => {
    expect(fc.evaluatePixel({ B11: -0.1, B8A: 2, B04: 0.4 })).toEqual([0, 255, 255]);
  });
});

describe('truecolor evalscript', () => {
  const tc = load(TRUECOLOR);
  it('orders B04, B03, B02 with gain 2.5, clamped', () => {
    expect(tc.evaluatePixel({ B02: 0.02, B03: 0.04, B04: 0.5 })).toEqual([255, 26, 13]);
  });
});

describe('nbr evalscript', () => {
  const nbr = load(NBR);
  it('encodes NBR in R and SCL validity in G', () => {
    expect(nbr.setup().input).toEqual(['B8A', 'B12', 'SCL']);
    const [r, g, b] = nbr.evaluatePixel({ B8A: 0.3, B12: 0.1, SCL: 4 });
    expect(r).toBe(Math.round(1.5 * 127.5));
    expect(g).toBe(255);
    expect(b).toBe(0);
  });
  it('valid only for SCL 4, 5, 6, 7', () => {
    for (let scl = 0; scl <= 11; scl++) {
      const g = nbr.evaluatePixel({ B8A: 0.3, B12: 0.1, SCL: scl })[1];
      expect(g).toBe([4, 5, 6, 7].includes(scl) ? 255 : 0);
    }
  });
  it('clamps R to 0–254 and handles a zero denominator', () => {
    expect(nbr.evaluatePixel({ B8A: 1, B12: 0, SCL: 4 })[0]).toBe(254);
    expect(nbr.evaluatePixel({ B8A: 0, B12: 1, SCL: 4 })[0]).toBe(0);
    expect(nbr.evaluatePixel({ B8A: 0, B12: 0, SCL: 4 })[0]).toBe(128);
  });
});
