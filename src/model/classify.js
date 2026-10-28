// Slices a scene into 128 px tiles (grid order) and classifies the valid ones in batches.
import * as tf from '@tensorflow/tfjs';
import { TILE_PX } from '../geo/grid.js';
import { batchTensor } from './preprocess.js';
import { cropTile } from './crop.js';

export { cropTile };

export const BATCH_SIZE = 16;

/**
 * loaded: result of loadModel(); image: false-colour scene; grid: tileGrid(box);
 * include(i): whether to classify tile i (e.g. valid tiles only).
 * Returns one { pForest, pNotForest } per tile, or null for skipped tiles.
 */
export async function classifyScene(loaded, image, grid, include = () => true) {
  const { model, imageSize, forestIndex, notForestIndex } = loaded;
  const side = Math.max(...grid.map((t) => Math.max(t.row, t.col))) + 1;
  if (image.width < side * TILE_PX || image.height < (Math.max(...grid.map((t) => t.row)) + 1) * TILE_PX) {
    throw new Error(`Scene ${image.width}×${image.height} px is smaller than the tile grid`);
  }
  const out = new Array(grid.length).fill(null);
  const todo = grid.map((t, i) => i).filter((i) => include(i));
  for (let k = 0; k < todo.length; k += BATCH_SIZE) {
    const ids = todo.slice(k, k + BATCH_SIZE);
    const x = batchTensor(ids.map((i) => cropTile(image, grid[i].row, grid[i].col)), imageSize);
    let y, probs;
    try {
      y = model.predict(x);
      probs = await y.array();
    } finally {
      tf.dispose([x, y].filter(Boolean));
    }
    ids.forEach((i, j) => {
      out[i] = { pForest: probs[j][forestIndex], pNotForest: probs[j][notForestIndex] };
    });
  }
  return out;
}

export const isForest = (p) => p.pForest >= 0.5;
