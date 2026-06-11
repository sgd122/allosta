import { describe, expect, it } from 'vitest';
import type { AvailabilitySlot } from '@/entities/availability';
import { selectSlotGroups, summarizeSlots } from './grouping';

const NOW = new Date(2026, 5, 11, 14, 0, 0); // 2026-06-11

const slot = (
  id: string,
  y: number,
  m: number,
  d: number,
  h: number,
  isOpen: boolean,
): AvailabilitySlot => ({
  id,
  counselorId: 'c1',
  startAt: new Date(y, m - 1, d, h, 0, 0).toISOString(),
  endAt: new Date(y, m - 1, d, h + 1, 0, 0).toISOString(),
  isOpen,
});

const slots: AvailabilitySlot[] = [
  slot('a', 2026, 6, 11, 9, true),
  slot('b', 2026, 6, 11, 15, false),
  slot('c', 2026, 6, 12, 10, true),
  slot('d', 2026, 6, 13, 11, true),
];

describe('summarizeSlots', () => {
  it('counts open vs total', () => {
    expect(summarizeSlots(slots)).toEqual({ total: 4, open: 3 });
  });

  it('handles an empty list', () => {
    expect(summarizeSlots([])).toEqual({ total: 0, open: 0 });
  });
});

describe('selectSlotGroups', () => {
  it('today returns only the current day, soonest-first', () => {
    const groups = selectSlotGroups(slots, 'today', NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].dateKey).toBe('2026-06-11');
    expect(groups[0].items.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('upcoming returns future days grouped ascending', () => {
    const groups = selectSlotGroups(slots, 'upcoming', NOW);
    expect(groups.map((g) => g.dateKey)).toEqual(['2026-06-12', '2026-06-13']);
  });

  it('all returns every day', () => {
    const groups = selectSlotGroups(slots, 'all', NOW);
    expect(groups).toHaveLength(3);
  });
});
