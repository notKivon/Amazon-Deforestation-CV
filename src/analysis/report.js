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

export const BURN_DNBR = 0.27; // burn detected if dNBR > 0.27 (strictly)
// Float noise: a true dNBR of exactly 0.27 can compute as 0.27000000000000002.
const EPS = 1e-9;
export const FOREST_P = 0.5; // Forest if P(Forest) ≥ 0.5

export const decodeNbr = (r) => r / 127.5 - 1;
const round1 = (v) => Math.round(v * 10) / 10;

/** Mean NBR over valid pixels per tile (null if the tile has no valid pixel). */
export function tileNbr(nbrImage, grid) {
  const { width, data } = nbrImage;
  return grid.map(({ row, col }) => {
    let sum = 0, n = 0;
    for (let y = row * TILE_PX; y < (row + 1) * TILE_PX; y++) {
      for (let x = col * TILE_PX; x < (col + 1) * TILE_PX; x++) {
        const i = (y * width + x) * 4;
        if (data[i + 1] >= 128) { sum += decodeNbr(data[i]); n++; }
      }
    }
    return n ? sum / n : null;
  });
}

/**
 * perYear (ascending years): [{ year, window, validity: number[], nbr: (number|null)[],
 *   probs: ({ pForest, pNotForest } | null)[] }] — arrays aligned with the tile grid.
 * Returns one entry per year. Too-cloudy (unreported) years carry no cover, classes, or
 * flags, and are skipped when looking back for a tile's previous valid year.
 */
export function buildReport(perYear) {
  const last = []; // per tile: { forest, nbr } at its latest valid reported year
  return perYear.map(({ year, window, validity, nbr, probs }) => {
    const valid = validity.map((f) => f >= VALID_PIXEL_MIN);
    const validCount = valid.filter(Boolean).length;
    const reported = validity.length > 0 && validCount / validity.length >= REPORTED_TILE_MIN;
    const base = { year, window, extended: window === 'extended', tileCount: validity.length, validCount, reported };
    if (!reported) {
      return { ...base, coverPct: null, forestCount: 0, notForestCount: 0, lossCount: 0, burnCount: 0,
        tiles: valid.map((v) => ({ valid: v, cls: null })) };
    }

    const tiles = valid.map((v, i) => {
      if (!v) return { valid: false, cls: null };
      if (!probs[i]) throw new Error(`Tile ${i} of ${year} is valid but was not classified`);
      const forest = probs[i].pForest >= FOREST_P;
      const prev = last[i];
      const loss = !!prev && prev.forest && !forest;
      const dNbr = prev && prev.nbr != null && nbr[i] != null ? prev.nbr - nbr[i] : null;
      const burn = dNbr != null && dNbr > BURN_DNBR + EPS;
      last[i] = { forest, nbr: nbr[i] };
      return {
        valid: true,
        cls: forest ? 'forest' : 'not_forest',
        pForest: probs[i].pForest,
        pNotForest: probs[i].pNotForest,
        confidencePct: round1(100 * (forest ? probs[i].pForest : probs[i].pNotForest)),
        loss, dNbr, burn,
        label: loss && burn ? 'loss — burn detected' : loss ? 'loss' : burn ? 'burn detected' : null,
      };
    });

    const classified = tiles.filter((t) => t.valid);
    const forestCount = classified.filter((t) => t.cls === 'forest').length;
    return {
      ...base,
      coverPct: round1((100 * forestCount) / classified.length),
      forestCount,
      notForestCount: classified.length - forestCount,
      lossCount: tiles.filter((t) => t.loss).length,
      burnCount: tiles.filter((t) => t.burn).length,
      tiles,
    };
  });
}
