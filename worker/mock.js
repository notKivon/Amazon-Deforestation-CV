// MOCK=1 imagery: deterministic synthetic scenes so the whole app runs without CDSE.
// Forest with clearings that grow each year, a river, burn scars on new clearings in even
// years, and (nbr only) cloud masks: base window in odd years ~70% masked, extended clear.
import { encodePng } from './png.js';

const CELL = 96; // noise cell size, px

function hash(a, b, c = 0) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth value noise in 0–1.
function noise(x, y, seed) {
  const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
  const fx = x / CELL - gx, fy = y / CELL - gy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(gx, gy, seed), b = hash(gx + 1, gy, seed);
  const c = hash(gx, gy + 1, seed), d = hash(gx + 1, gy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const clearedShare = (year) => 0.12 + 0.03 * (year - 2017);

/** Land-cover class of a pixel: 'water' | 'forest' | 'cleared' | 'burned'. */
export function mockCover(x, y, year, seed, height) {
  if (Math.abs(y - (height * 0.6 + 40 * Math.sin(x / 70))) < 5) return 'water';
  const n = noise(x, y, seed);
  if (n >= clearedShare(year)) return 'forest';
  if (year % 2 === 0 && n >= clearedShare(year - 1)) return 'burned';
  return 'cleared';
}

const COLOURS = {
  truecolor: { forest: [28, 62, 30], cleared: [168, 150, 118], burned: [52, 42, 36], water: [28, 48, 66] },
  falsecolor: { forest: [70, 160, 25], cleared: [205, 135, 165], burned: [95, 45, 30], water: [12, 18, 45] },
};
const NBR_VALUE = { forest: 0.62, cleared: 0.12, burned: -0.25, water: -0.1 };

function masked(x, y, year, window, seed) {
  if (window === 'extended' || year % 2 === 0) return hash(x >> 6, y >> 6, seed + year) < 0.03;
  return hash(x >> 6, y >> 6, seed + year * 7) < 0.7;
}

export function mockPixels({ product, year, window, width, height, seed }) {
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cover = mockCover(x, y, year, seed, height);
      const i = (y * width + x) * 3;
      if (product === 'nbr') {
        rgb[i] = Math.min(254, Math.max(0, Math.round((NBR_VALUE[cover] + 1) * 127.5)));
        rgb[i + 1] = masked(x, y, year, window, seed) ? 0 : 255;
      } else {
        rgb.set(COLOURS[product][cover], i);
      }
    }
  }
  return rgb;
}

export async function mockPng(params) {
  return encodePng(params.width, params.height, mockPixels(params));
}

/** Seed from the box position so different places look different. */
export const mockSeed = (box) => (Math.round(box.minX / 1280) * 31 + Math.round(box.minY / 1280)) | 0;
