/**
 * Pure filter + group logic for the counselor schedule. Kept separate from the
 * page component so the date-scope / status rules are unit-testable without a
 * React render. The page owns only state wiring; all decisions live here.
 */
import type { ScheduleEntry } from '@/entities/schedule';
import { groupByDay, matchesScope, type DateScope, type DayGroup } from '@/shared/lib/date';
import type { StatusFilter } from '../types';

/** Applies the status filter; `ALL` passes everything through. */
export function filterByStatus(
  entries: readonly ScheduleEntry[],
  status: StatusFilter,
): ScheduleEntry[] {
  if (status === 'ALL') return [...entries];
  return entries.filter((entry) => entry.status === status);
}

/** Applies the date-scope lens against each entry's slot start time. */
export function filterByScope(
  entries: readonly ScheduleEntry[],
  scope: DateScope,
  now: Date = new Date(),
): ScheduleEntry[] {
  return entries.filter((entry) => matchesScope(entry.slot.startAt, scope, now));
}

/**
 * Filters by scope then status, then groups the survivors by calendar day. The
 * 지난(past) lens lists most-recent-first; every other lens lists soonest-first.
 */
export function selectScheduleGroups(
  entries: readonly ScheduleEntry[],
  scope: DateScope,
  status: StatusFilter,
  now: Date = new Date(),
): DayGroup<ScheduleEntry>[] {
  const scoped = filterByScope(entries, scope, now);
  const filtered = filterByStatus(scoped, status);
  return groupByDay(filtered, (entry) => entry.slot.startAt, scope === 'past');
}

/** Count of entries per status, for the toolbar's filter badges. */
export function countByStatus(
  entries: readonly ScheduleEntry[],
): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = {
    ALL: entries.length,
    PENDING: 0,
    CONFIRMED: 0,
    COMPLETED: 0,
    NO_SHOW: 0,
  };
  for (const entry of entries) {
    if (entry.status !== 'CANCELLED') counts[entry.status] += 1;
  }
  return counts;
}
