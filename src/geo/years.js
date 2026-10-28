// Report years: 2017 through the latest year whose extended window has ended.
export const FIRST_YEAR = 2017;

// First UTC day after the extended window ends: south Oct 1, north May 1.
const AVAILABLE_FROM_MONTH = { south: 10, north: 5 };

export function latestYear(zone, nowUtc) {
  const month = AVAILABLE_FROM_MONTH[zone];
  if (!month) throw new Error(`Unknown zone: ${zone}`);
  const y = nowUtc.getUTCFullYear();
  return nowUtc.getTime() >= Date.UTC(y, month - 1, 1) ? y : y - 1;
}

export function availableYears(zone, nowUtc) {
  const years = [];
  for (let y = FIRST_YEAR; y <= latestYear(zone, nowUtc); y++) years.push(y);
  return years;
}
