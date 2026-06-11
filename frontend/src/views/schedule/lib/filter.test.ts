import { describe, expect, it } from 'vitest';
import type { ScheduleEntry } from '@/entities/schedule';
import type { BookingStatus } from '@/shared/config';
import {
  countByStatus,
  filterByScope,
  filterByStatus,
  selectScheduleGroups,
} from './filter';

const NOW = new Date(2026, 5, 11, 14, 0, 0); // 2026-06-11 (목)

const entry = (
  id: string,
  status: BookingStatus,
  y: number,
  m: number,
  d: number,
  h = 10,
): ScheduleEntry => ({
  bookingId: id,
  slot: {
    startAt: new Date(y, m - 1, d, h, 0, 0).toISOString(),
    endAt: new Date(y, m - 1, d, h + 1, 0, 0).toISOString(),
  },
  subjectType: 'CUSTOMER',
  subjectId: `subj-${id}`,
  subjectName: `Subject ${id}`,
  customerId: `cust-${id}`,
  customerName: `Customer ${id}`,
  hasRecord: status === 'COMPLETED',
  status,
});

const entries: ScheduleEntry[] = [
  entry('a', 'CONFIRMED', 2026, 6, 11, 9),
  entry('b', 'PENDING', 2026, 6, 11, 16),
  entry('c', 'COMPLETED', 2026, 6, 10, 10),
  entry('d', 'NO_SHOW', 2026, 6, 9, 11),
  entry('e', 'CONFIRMED', 2026, 6, 13, 10),
];

describe('filterByStatus', () => {
  it('passes everything through for ALL', () => {
    expect(filterByStatus(entries, 'ALL')).toHaveLength(5);
  });

  it('isolates a single status, including NO_SHOW', () => {
    expect(filterByStatus(entries, 'NO_SHOW').map((e) => e.bookingId)).toEqual(['d']);
  });
});

describe('filterByScope', () => {
  it('today returns only the current calendar day', () => {
    expect(filterByScope(entries, 'today', NOW).map((e) => e.bookingId).sort()).toEqual([
      'a',
      'b',
    ]);
  });

  it('past returns earlier days, upcoming returns future days', () => {
    expect(filterByScope(entries, 'past', NOW).map((e) => e.bookingId).sort()).toEqual([
      'c',
      'd',
    ]);
    expect(filterByScope(entries, 'upcoming', NOW).map((e) => e.bookingId)).toEqual(['e']);
  });
});

describe('selectScheduleGroups', () => {
  it('groups today by day, soonest-first within the day', () => {
    const groups = selectScheduleGroups(entries, 'today', 'ALL', NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].dateKey).toBe('2026-06-11');
    expect(groups[0].items.map((e) => e.bookingId)).toEqual(['a', 'b']);
  });

  it('orders past groups most-recent-first', () => {
    const groups = selectScheduleGroups(entries, 'past', 'ALL', NOW);
    expect(groups.map((g) => g.dateKey)).toEqual(['2026-06-10', '2026-06-09']);
  });

  it('combines scope and status filters', () => {
    const groups = selectScheduleGroups(entries, 'past', 'NO_SHOW', NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((e) => e.bookingId)).toEqual(['d']);
  });
});

describe('countByStatus', () => {
  it('tallies each surfaced status and the ALL total', () => {
    const counts = countByStatus(entries);
    expect(counts.ALL).toBe(5);
    expect(counts.CONFIRMED).toBe(2);
    expect(counts.NO_SHOW).toBe(1);
    expect(counts.PENDING).toBe(1);
    expect(counts.COMPLETED).toBe(1);
  });
});
