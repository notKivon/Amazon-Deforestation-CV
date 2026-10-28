// UTM layout of the selected square and its 128 px tile grid (10 m pixels).
import proj4 from 'proj4';

export const PIXEL_M = 10;
export const TILE_PX = 128;
export const TILE_M = TILE_PX * PIXEL_M; // 1280 m

export function utmZone(lon) {
  return Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1));
}

export function utmEpsg(lon, lat) {
  return (lat >= 0 ? 32600 : 32700) + utmZone(lon);
}

function projDef(epsg) {
  const zone = epsg % 100;
  const south = epsg >= 32700 ? ' +south' : '';
  return `+proj=utm +zone=${zone}${south} +datum=WGS84 +units=m +no_defs`;
}

export function toUtm(epsg, lon, lat) {
  return proj4('WGS84', projDef(epsg), [lon, lat]);
}

/** UTM metres → [lat, lon]. */
export function toLatLon(epsg, x, y) {
  const [lon, lat] = proj4(projDef(epsg), 'WGS84', [x, y]);
  return [lat, lon];
}

export function areaBox(lon, lat, tilesPerSide) {
  const epsg = utmEpsg(lon, lat);
  const [x, y] = toUtm(epsg, lon, lat);
  const cx = Math.round(x / PIXEL_M) * PIXEL_M;
  const cy = Math.round(y / PIXEL_M) * PIXEL_M;
  const half = (tilesPerSide * TILE_M) / 2; // a multiple of 10 m for any tilesPerSide
  const px = tilesPerSide * TILE_PX;
  return { epsg, minX: cx - half, minY: cy - half, maxX: cx + half, maxY: cy + half, width: px, height: px };
}

/** Corners as [lat, lon] in order NW, NE, SE, SW. */
function corners(epsg, minX, minY, maxX, maxY) {
  return [
    toLatLon(epsg, minX, maxY),
    toLatLon(epsg, maxX, maxY),
    toLatLon(epsg, maxX, minY),
    toLatLon(epsg, minX, minY),
  ];
}

export function boxCornersLatLon(box) {
  return corners(box.epsg, box.minX, box.minY, box.maxX, box.maxY);
}

export function boxCentreLatLon(box) {
  return toLatLon(box.epsg, (box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2);
}

/** Tiles in row-major order, row 0 = north, col 0 = west. */
export function tileGrid(box) {
  const n = Math.round((box.maxX - box.minX) / TILE_M);
  const tiles = [];
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const minX = box.minX + col * TILE_M;
      const maxY = box.maxY - row * TILE_M;
      const t = { row, col, minX, minY: maxY - TILE_M, maxX: minX + TILE_M, maxY };
      t.cornersLatLon = corners(box.epsg, t.minX, t.minY, t.maxX, t.maxY);
      tiles.push(t);
    }
  }
  return tiles;
}
