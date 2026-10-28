// Point-in-polygon (ray casting) for GeoJSON Polygon / MultiPolygon, holes included.
function inRing(ring, lon, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(rings, lon, lat) {
  if (!inRing(rings[0], lon, lat)) return false;
  for (let k = 1; k < rings.length; k++) if (inRing(rings[k], lon, lat)) return false;
  return true;
}

export function geometryPolygons(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  throw new Error(`Unsupported geometry type: ${geometry.type}`);
}

/** Precompute polygons + bounding boxes for fast repeated lookups. */
export function indexGeometry(geometry) {
  return geometryPolygons(geometry).map((rings) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of rings[0]) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { rings, minX, minY, maxX, maxY };
  });
}

export function pointInIndex(index, lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
  return index.some(
    (p) => lon >= p.minX && lon <= p.maxX && lat >= p.minY && lat <= p.maxY && inPolygon(p.rings, lon, lat),
  );
}
