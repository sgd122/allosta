/**
 * shared/lib/date — calendar-day scoping and grouping primitives.
 *
 * The counselor schedule and availability surfaces both need the same two
 * operations: (a) filter a list of time-stamped rows down to a date scope
 * (오늘 / 예정 / 지난 / 전체), and (b) group the survivors by calendar day so the
 * UI can render dated sections. Centralizing the logic here keeps both views
 * consistent and the rules unit-testable in isolation.
 *
 * All comparisons are LOCAL-day based (matching the server's local-hour business
 * window in availability.service) — two instants belong to the same group when
 * they fall on the same local calendar date, regardless of clock time.
 */
import { formatDay } from '@/shared/lib/format';

/** Date filter lenses offered to the counselor. */
export type DateScope = 'today' | 'upcoming' | 'past' | 'all';

/** Local YYYY-MM-DD key used for grouping and same-day comparison. */
export function toDateKey(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Local midnight epoch for `value` — the anchor for whole-day arithmetic. */
function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

const ONE_DAY_MS = 86_400_000;

/**
 * Whole-day offset of `iso` relative to `now`: negative for past days, 0 for
 * today, positive for future days. Clock time within the day is ignored.
 */
export function dayDiff(iso: string, now: Date = new Date()): number {
  return Math.round((startOfDay(new Date(iso)) - startOfDay(now)) / ONE_DAY_MS);
}

/** True when `iso` falls on a calendar day matching the requested scope. */
export function matchesScope(
  iso: string,
  scope: DateScope,
  now: Date = new Date(),
): boolean {
  if (scope === 'all') return true;
  const diff = dayDiff(iso, now);
  if (scope === 'today') return diff === 0;
  if (scope === 'upcoming') return diff > 0;
  return diff < 0; // 'past'
}

/** A set of rows that share one calendar day, keyed by its YYYY-MM-DD. */
export interface DayGroup<T> {
  dateKey: string;
  /** Representative ISO timestamp for the day (the first item's). */
  iso: string;
  items: T[];
}

/**
 * Groups `items` by local calendar day. Groups are returned chronologically
 * ascending by default; pass `descending` to surface the most recent day first
 * (used by the 지난 / past lens). Input is never mutated.
 */
export function groupByDay<T>(
  items: readonly T[],
  getIso: (item: T) => string,
  descending = false,
): DayGroup<T>[] {
  const buckets = new Map<string, { iso: string; items: T[] }>();
  for (const item of items) {
    const iso = getIso(item);
    const dateKey = toDateKey(iso);
    const bucket = buckets.get(dateKey);
    if (bucket) {
      bucket.items = [...bucket.items, item];
    } else {
      buckets.set(dateKey, { iso, items: [item] });
    }
  }

  const groups = Array.from(buckets.entries()).map(([dateKey, { iso, items }]) => ({
    dateKey,
    iso,
    items,
  }));
  groups.sort((a, b) =>
    descending ? b.dateKey.localeCompare(a.dateKey) : a.dateKey.localeCompare(b.dateKey),
  );
  return groups;
}

/**
 * Friendly day header, e.g. "오늘 · 6월 11일 수요일" or "6월 13일 금요일".
 * Prefixes a relative label for the adjacent days so the counselor can scan
 * dated sections without doing the arithmetic.
 */
export function formatDayHeader(iso: string, now: Date = new Date()): string {
  const base = formatDay(iso);
  const diff = dayDiff(iso, now);
  if (diff === 0) return `오늘 · ${base}`;
  if (diff === 1) return `내일 · ${base}`;
  if (diff === -1) return `어제 · ${base}`;
  return base;
}
