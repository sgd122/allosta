import { describe, expect, it } from 'vitest';
import {
  dayDiff,
  formatDayHeader,
  groupByDay,
  matchesScope,
  toDateKey,
} from './index';

// Fixed reference instant: 2026-06-11 (목) 14:00 local.
const NOW = new Date(2026, 5, 11, 14, 0, 0);

const at = (y: number, m: number, d: number, h = 10): string =>
  new Date(y, m - 1, d, h, 0, 0).toISOString();

describe('toDateKey', () => {
  it('renders a local YYYY-MM-DD key with zero padding', () => {
    expect(toDateKey(new Date(2026, 0, 5, 23))).toBe('2026-01-05');
  });

  it('accepts an ISO string', () => {
    expect(toDateKey(at(2026, 6, 11))).toBe('2026-06-11');
  });
});

describe('dayDiff', () => {
  it('returns 0 for the same calendar day regardless of time', () => {
    expect(dayDiff(at(2026, 6, 11, 23), NOW)).toBe(0);
    expect(dayDiff(at(2026, 6, 11, 1), NOW)).toBe(0);
  });

  it('returns positive for future days and negative for past days', () => {
    expect(dayDiff(at(2026, 6, 13), NOW)).toBe(2);
    expect(dayDiff(at(2026, 6, 10), NOW)).toBe(-1);
  });
});

describe('matchesScope', () => {
  it('today matches only the current calendar day', () => {
    expect(matchesScope(at(2026, 6, 11, 9), 'today', NOW)).toBe(true);
    expect(matchesScope(at(2026, 6, 12), 'today', NOW)).toBe(false);
  });

  it('upcoming matches strictly future days', () => {
    expect(matchesScope(at(2026, 6, 12), 'upcoming', NOW)).toBe(true);
    expect(matchesScope(at(2026, 6, 11, 18), 'upcoming', NOW)).toBe(false);
  });

  it('past matches strictly earlier days', () => {
    expect(matchesScope(at(2026, 6, 10), 'past', NOW)).toBe(true);
    expect(matchesScope(at(2026, 6, 11, 8), 'past', NOW)).toBe(false);
  });

  it('all matches everything', () => {
    expect(matchesScope(at(2020, 1, 1), 'all', NOW)).toBe(true);
    expect(matchesScope(at(2030, 1, 1), 'all', NOW)).toBe(true);
  });
});

describe('groupByDay', () => {
  const rows = [
    { id: 'a', when: at(2026, 6, 12, 9) },
    { id: 'b', when: at(2026, 6, 11, 15) },
    { id: 'c', when: at(2026, 6, 12, 11) },
    { id: 'd', when: at(2026, 6, 10, 10) },
  ];

  it('buckets rows by local day, ascending by default', () => {
    const groups = groupByDay(rows, (r) => r.when);
    expect(groups.map((g) => g.dateKey)).toEqual([
      '2026-06-10',
      '2026-06-11',
      '2026-06-12',
    ]);
    expect(groups[2].items.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('sorts groups descending when requested', () => {
    const groups = groupByDay(rows, (r) => r.when, true);
    expect(groups.map((g) => g.dateKey)).toEqual([
      '2026-06-12',
      '2026-06-11',
      '2026-06-10',
    ]);
  });

  it('does not mutate the input array', () => {
    const snapshot = [...rows];
    groupByDay(rows, (r) => r.when);
    expect(rows).toEqual(snapshot);
  });
});

describe('formatDayHeader', () => {
  it('prefixes 오늘 / 내일 / 어제 for adjacent days', () => {
    expect(formatDayHeader(at(2026, 6, 11), NOW)).toMatch(/^오늘 · /);
    expect(formatDayHeader(at(2026, 6, 12), NOW)).toMatch(/^내일 · /);
    expect(formatDayHeader(at(2026, 6, 10), NOW)).toMatch(/^어제 · /);
  });

  it('omits the prefix for non-adjacent days', () => {
    expect(formatDayHeader(at(2026, 6, 15), NOW)).not.toMatch(/^(오늘|내일|어제) · /);
  });
});
