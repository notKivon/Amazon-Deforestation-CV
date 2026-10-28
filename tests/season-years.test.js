import { describe, it, expect } from 'vitest';
import { zoneFor, windowFor } from '../src/geo/season.js';
import { availableYears, latestYear } from '../src/geo/years.js';

describe('zoneFor', () => {
  it('1.999 → south', () => expect(zoneFor(1.999)).toBe('south'));
  it('2.0 → north', () => expect(zoneFor(2.0)).toBe('north'));
  it('−7 → south', () => expect(zoneFor(-7)).toBe('south'));
});

describe('windowFor 2025', () => {
  it('south base', () =>
    expect(windowFor('south', 2025, 'base')).toEqual({ from: '2025-06-01T00:00:00Z', to: '2025-08-31T23:59:59Z' }));
  it('south extended', () =>
    expect(windowFor('south', 2025, 'extended')).toEqual({ from: '2025-05-01T00:00:00Z', to: '2025-09-30T23:59:59Z' }));
  it('north base starts in 2024', () =>
    expect(windowFor('north', 2025, 'base')).toEqual({ from: '2024-12-01T00:00:00Z', to: '2025-03-31T23:59:59Z' }));
  it('north extended starts in 2024', () =>
    expect(windowFor('north', 2025, 'extended')).toEqual({ from: '2024-11-01T00:00:00Z', to: '2025-04-30T23:59:59Z' }));
  it('rejects unknown kinds and zones', () => {
    expect(() => windowFor('south', 2025, 'year')).toThrow();
    expect(() => windowFor('east', 2025, 'base')).toThrow();
  });
});

describe('availableYears', () => {
  const at = (iso) => new Date(iso);
  it('south: 2026-09-30 → up to 2025', () => {
    const ys = availableYears('south', at('2026-09-30T23:59:59Z'));
    expect(ys[0]).toBe(2017);
    expect(ys.at(-1)).toBe(2025);
  });
  it('south: 2026-10-01 → up to 2026', () =>
    expect(availableYears('south', at('2026-10-01T00:00:00Z')).at(-1)).toBe(2026));
  it('north: 2026-04-30 → up to 2025', () =>
    expect(availableYears('north', at('2026-04-30T23:59:59Z')).at(-1)).toBe(2025));
  it('north: 2026-05-01 → up to 2026', () =>
    expect(availableYears('north', at('2026-05-01T00:00:00Z')).at(-1)).toBe(2026));
  it('lists every year from 2017 contiguously', () => {
    const ys = availableYears('south', at('2026-10-28T00:00:00Z'));
    expect(ys).toEqual([2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    expect(latestYear('north', at('2026-10-28T00:00:00Z'))).toBe(2026);
  });
});
