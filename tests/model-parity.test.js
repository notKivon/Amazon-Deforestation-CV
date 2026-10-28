// Parity: the browser pipeline (load → preprocess → classify) on the 143 held-out v2 tiles.
// Pure-JS CPU backend, so this takes about a minute.
import { describe, it, expect, beforeAll } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import { readFileSync } from 'node:fs';
import { loadModel, readMetadata } from '../src/model/load.js';
import { classifyScene, cropTile, isForest } from '../src/model/classify.js';
import { decodePng } from './helpers/png.js';

const fileHandler = () => {
  const mj = JSON.parse(readFileSync('public/model/model.json', 'utf8'));
  const w = readFileSync('public/model/weights.bin');
  return {
    load: async () => ({
      modelTopology: mj.modelTopology,
      weightSpecs: mj.weightsManifest.flatMap((g) => g.weights),
      weightData: w.buffer.slice(w.byteOffset, w.byteOffset + w.byteLength),
    }),
  };
};

// Expected eval.js output: true_class,file,p_Forest,p_Not_Forest,pred
const rows = readFileSync('fixtures/test_tiles/model_v2_predictions.csv', 'utf8')
  .trim().split('\n').slice(1).map((l) => l.split(','))
  .map(([trueClass, file, pF, pN, pred]) => ({ trueClass, file, pF: +pF, pN: +pN, pred }));

describe('model parity (v2, 143 test tiles)', () => {
  let probs;

  beforeAll(async () => {
    await tf.setBackend('cpu');
    const metadata = JSON.parse(readFileSync('public/model/metadata.json', 'utf8'));
    const loaded = await loadModel({ source: fileHandler(), metadata });
    // Lay the tiles side by side in one scene so classifyScene's slicing is exercised too.
    const n = rows.length;
    const scene = { width: n * 128, height: 128, data: new Uint8ClampedArray(n * 128 * 128 * 4) };
    for (let i = 0; i < n; i++) {
      const dir = rows[i].trueClass === 'forest' ? 'forest' : 'not_forest';
      const { rgb } = await decodePng(readFileSync(`fixtures/test_tiles/${dir}/${rows[i].file}`));
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
        const s = (y * 128 + x) * 3, d = (y * scene.width + i * 128 + x) * 4;
        scene.data[d] = rgb[s]; scene.data[d + 1] = rgb[s + 1]; scene.data[d + 2] = rgb[s + 2]; scene.data[d + 3] = 255;
      }
    }
    const grid = rows.map((_, i) => ({ row: 0, col: i }));
    probs = await classifyScene(loaded, scene, grid);
  }, 600_000);

  it('the manifest lists all 143 tiles', () => {
    const manifest = JSON.parse(readFileSync('fixtures/test_tiles/manifest.json', 'utf8'));
    expect(manifest.chips).toHaveLength(143);
    expect(rows).toHaveLength(143);
  });

  it('scores ≥ 140/143 against the true labels', () => {
    const correct = probs.filter((p, i) => isForest(p) === (rows[i].trueClass === 'forest')).length;
    expect(correct).toBeGreaterThanOrEqual(140);
  });

  it('matches eval.js predicted class on ≥ 141/143 tiles', () => {
    const agree = probs.filter((p, i) => isForest(p) === (rows[i].pred === 'forest')).length;
    expect(agree).toBeGreaterThanOrEqual(141);
  });

  it('reproduces eval.js probabilities (within 0.001)', () => {
    probs.forEach((p, i) => {
      expect(Math.abs(p.pForest - rows[i].pF)).toBeLessThan(1e-3);
      expect(Math.abs(p.pNotForest - rows[i].pN)).toBeLessThan(1e-3);
    });
  });
});

describe('metadata and slicing', () => {
  it('finds labels by name, whatever their order', () => {
    expect(readMetadata({ labels: ['Not Forest', 'Forest'], imageSize: 224 })).toMatchObject({ forestIndex: 1, notForestIndex: 0 });
    expect(() => readMetadata({ labels: ['A', 'B'], imageSize: 224 })).toThrow();
    expect(() => readMetadata({ labels: ['Forest', 'Not Forest'] })).toThrow();
  });

  it('cropTile copies the right 128 px block', () => {
    const w = 256, data = new Uint8ClampedArray(w * w * 4);
    for (let i = 0; i < w * w; i++) data[i * 4] = (Math.floor(i / w) >= 128 ? 2 : 0) + ((i % w) >= 128 ? 1 : 0);
    const t = cropTile({ width: w, height: w, data }, 1, 0);
    expect(t.width).toBe(128);
    expect(new Set(Array.from({ length: 128 * 128 }, (_, i) => t.data[i * 4]))).toEqual(new Set([2]));
  });
});
