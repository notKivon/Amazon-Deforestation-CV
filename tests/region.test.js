import { describe, it, expect } from 'vitest';
import { pointInAmazon, areaInsideAmazon, amazonOutline } from '../src/geo/region.js';
import { areaBox } from '../src/geo/grid.js';
import { indexGeometry, pointInIndex } from '../src/geo/polygon.js';

describe('pointInAmazon', () => {
  it('Manaus inside', () => expect(pointInAmazon(-60.02, -3.1)).toBe(true));
  it('acceptance sites inside', () => {
    expect(pointInAmazon(-55.42, -7.05)).toBe(true); // Novo Progresso
    expect(pointInAmazon(-62.0, -2.0)).toBe(true); // Jaú
    expect(pointInAmazon(-64.8, -7.26)).toBe(true); // Lábrea
    expect(pointInAmazon(-58.8, 4.5)).toBe(true); // Iwokrama
  });
  it('Brasília outside', () => expect(pointInAmazon(-47.88, -15.79)).toBe(false));
  it('Atlantic outside', () => expect(pointInAmazon(-30, -5)).toBe(false));
  it('non-finite input outside', () => expect(pointInAmazon(NaN, -3)).toBe(false));
  it('outline is one simplified feature', () => {
    expect(amazonOutline.features).toHaveLength(1);
  });
});

describe('areaInsideAmazon', () => {
  it('accepts an 8×8 box at Manaus', () => expect(areaInsideAmazon(areaBox(-60.02, -3.1, 8))).toBe(true));
  it('rejects a box at Brasília', () => expect(areaInsideAmazon(areaBox(-47.88, -15.79, 2))).toBe(false));

  it('rejects a box whose centre is inside but a corner is outside', () => {
    // Walk east from Manaus along its latitude until the point just leaves the outline,
    // then step back 2 km so the centre is inside and the 10 km box straddles the edge.
    let lon = -60.02;
    while (pointInAmazon(lon, -3.1)) lon += 0.005;
    const centreLon = lon - 0.018;
    expect(pointInAmazon(centreLon, -3.1)).toBe(true);
    expect(areaInsideAmazon(areaBox(centreLon, -3.1, 8))).toBe(false);
  });
});

describe('polygon holes', () => {
  it('excludes points in a hole and handles multipolygons', () => {
    const square = (x0, y0, s) => [[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s], [x0, y0]];
    const idx = indexGeometry({
      type: 'MultiPolygon',
      coordinates: [[square(0, 0, 10), square(4, 4, 2)], [square(20, 20, 1)]],
    });
    expect(pointInIndex(idx, 1, 1)).toBe(true);
    expect(pointInIndex(idx, 5, 5)).toBe(false);
    expect(pointInIndex(idx, 20.5, 20.5)).toBe(true);
    expect(pointInIndex(idx, 15, 15)).toBe(false);
  });
});
