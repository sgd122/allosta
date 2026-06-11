/**
 * Pure scope-filter + day-grouping + per-day summary for the availability
 * surface. Extracted from the page so the rules are unit-testable and the
 * component stays declarative.
 */
import type { AvailabilitySlot } from '@/entities/availability';
import { groupByDay, matchesScope, type DateScope, type DayGroup } from '@/shared/lib/date';

/** Open-vs-total tally for a day's slots, shown in the day header. */
export interface DaySlotSummary {
  total: number;
  open: number;
}

export function summarizeSlots(slots: readonly AvailabilitySlot[]): DaySlotSummary {
  let open = 0;
  for (const slot of slots) if (slot.isOpen) open += 1;
  return { total: slots.length, open };
}

/** Filters slots to the date scope, then groups them by calendar day (ascending). */
export function selectSlotGroups(
  slots: readonly AvailabilitySlot[],
  scope: DateScope,
  now: Date = new Date(),
): DayGroup<AvailabilitySlot>[] {
  const scoped = slots.filter((slot) => matchesScope(slot.startAt, scope, now));
  return groupByDay(scoped, (slot) => slot.startAt);
}
