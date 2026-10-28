// Tile crops from a scene (no TensorFlow dependency, so the UI can use it directly).
import { TILE_PX } from '../geo/grid.js';

/** RGBA crop of one tile (row/col) from an ImageData-like scene. */
export function cropTile(image, row, col, size = TILE_PX) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const start = ((row * size + y) * image.width + col * size) * 4;
    data.set(image.data.subarray(start, start + size * 4), y * size * 4);
  }
  return { width: size, height: size, data };
}
