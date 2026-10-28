// Per-tile statistics and the year-by-year report (pure functions).
// Images are ImageData-like: { width, height, data: RGBA bytes }.
import { TILE_PX } from '../geo/grid.js';

export const VALID_PIXEL_MIN = 0.7; // tile valid if ≥ 70% of pixels are valid
export const REPORTED_TILE_MIN = 0.5; // year reported if ≥ 50% of tiles are valid

/** Valid-pixel fraction per tile, from the nbr image's mask channel (G = 255 valid). */
export function tileValidity(nbrImage, grid) {
  const { width, data } = nbrImage;
  return grid.map(({ row, col }) => {
    let valid = 0;
    for (let y = row * TILE_PX; y < (row + 1) * TILE_PX; y++) {
      for (let x = col * TILE_PX; x < (col + 1) * TILE_PX; x++) {
        if (data[(y * width + x) * 4 + 1] >= 128) valid++;
      }
    }
    return valid / (TILE_PX * TILE_PX);
  });
}

/** Fraction of tiles that are valid (≥ 70% valid pixels). */
export function validTileShare(fractions) {
  if (!fractions.length) return 0;
  return fractions.filter((f) => f >= VALID_PIXEL_MIN).length / fractions.length;
}
