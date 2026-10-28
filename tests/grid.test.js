import { describe, it, expect } from 'vitest';
import { utmEpsg, areaBox, tileGrid, toUtm, boxCornersLatLon, TILE_M } from '../src/geo/grid.js';

describe('utmEpsg', () => {
  it('Manaus → 32720 (zone 20 south)', () => expect(utmEpsg(-60.02, -3.1)).toBe(32720));
  it('Iwokrama (north) → 32621', () => expect(utmEpsg(-58.8, 4.5)).toBe(32621));
  it('Novo Progresso → 32721', () => expect(utmEpsg(-55.42, -7.05)).toBe(32721));
  it('zone edge −60° belongs to zone 21', () => expect(utmEpsg(-60, -1)).toBe(32721));
});

describe('areaBox', () => {
  for (const n of [2, 4, 5, 8]) {
    it(`${n} tiles per side: exact side, 10 m edges, ${n * 128} px`, () => {
      const b = areaBox(-60.02, -3.1, n);
      expect(b.maxX - b.minX).toBe(n * 1280);
      expect(b.maxY - b.minY).toBe(n * 1280);
      for (const v of [b.minX, b.minY, b.maxX, b.maxY]) expect(v % 10).toBe(0);
      expect(b.width).toBe(n * 128);
      expect(b.height).toBe(n * 128);
    });
  }

  it('rejects non-integer or out-of-range sizes and bad coordinates', () => {
    for (const n of [1, 9, 4.5, '4', NaN]) expect(() => areaBox(-60, -3, n)).toThrow(RangeError);
    expect(() => areaBox(NaN, -3, 4)).toThrow(RangeError);
  });

  it('is centred on the point within 5 m', () => {
    const b = areaBox(-55.42, -7.05, 8);
    const [x, y] = toUtm(b.epsg, -55.42, -7.05);
    expect(Math.abs((b.minX + b.maxX) / 2 - x)).toBeLessThanOrEqual(5);
    expect(Math.abs((b.minY + b.maxY) / 2 - y)).toBeLessThanOrEqual(5);
  });
});

describe('tileGrid', () => {
  const box = areaBox(-60.02, -3.1, 4);
  const tiles = tileGrid(box);

  it('has n² tiles of 1280 m, row 0 at the north edge', () => {
    expect(tiles).toHaveLength(16);
    expect(tiles[0]).toMatchObject({ row: 0, col: 0, minX: box.minX, maxY: box.maxY });
    expect(tiles[15]).toMatchObject({ row: 3, col: 3, maxX: box.maxX, minY: box.minY });
    for (const t of tiles) {
      expect(t.maxX - t.minX).toBe(TILE_M);
      expect(t.maxY - t.minY).toBe(TILE_M);
    }
  });

  it('corner lat/lon round-trips to UTM within 1 m', () => {
    for (const t of tiles) {
      const want = [[t.minX, t.maxY], [t.maxX, t.maxY], [t.maxX, t.minY], [t.minX, t.minY]];
      t.cornersLatLon.forEach(([lat, lon], i) => {
        const [x, y] = toUtm(box.epsg, lon, lat);
        expect(Math.hypot(x - want[i][0], y - want[i][1])).toBeLessThan(1);
      });
    }
  });

  it('box corners are NW, NE, SE, SW', () => {
    const [nw, ne, se, sw] = boxCornersLatLon(box);
    expect(nw[0]).toBeGreaterThan(sw[0]);
    expect(ne[1]).toBeGreaterThan(nw[1]);
    expect(se[0]).toBeLessThan(ne[0]);
  });
});
