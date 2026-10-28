// Dry-season windows by zone (CLAUDE.md → Seasons). All UTC.
export const NORTH_ZONE_MIN_LAT = 2.0;

export function zoneFor(lat) {
  return lat >= NORTH_ZONE_MIN_LAT ? 'north' : 'south';
}

const pad = (n) => String(n).padStart(2, '0');
const start = (y, m, d) => `${y}-${pad(m)}-${pad(d)}T00:00:00Z`;
const end = (y, m, d) => `${y}-${pad(m)}-${pad(d)}T23:59:59Z`;

export function windowFor(zone, year, kind) {
  if (kind !== 'base' && kind !== 'extended') throw new Error(`Unknown window kind: ${kind}`);
  const ext = kind === 'extended';
  if (zone === 'south') {
    return ext
      ? { from: start(year, 5, 1), to: end(year, 9, 30) }
      : { from: start(year, 6, 1), to: end(year, 8, 31) };
  }
  if (zone === 'north') {
    return ext
      ? { from: start(year - 1, 11, 1), to: end(year, 4, 30) }
      : { from: start(year - 1, 12, 1), to: end(year, 3, 31) };
  }
  throw new Error(`Unknown zone: ${zone}`);
}
