/**
 * Pure calendar-grid helpers for the booking month view.
 * No React, no side effects — easy to reason about and test.
 */

import type { CalendarDay } from '../types';

/** A single cell in the rendered month grid. */
export interface MonthCell {
  /** 'YYYY-MM-DD' for this cell. */
  date: string;
  /** Day-of-month number, 1..31. */
  dayOfMonth: number;
  /** True when the cell belongs to the month being displayed (vs. padding). */
  inCurrentMonth: boolean;
  /** True when the cell is today. */
  isToday: boolean;
  /** True when the date is before today (cannot be booked). */
  isPast: boolean;
}

/** Identifies a month by year + zero-based month index. */
export interface MonthKey {
  year: number;
  /** 0 = January … 11 = December. */
  month: number;
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export function weekdayLabels(): readonly string[] {
  return WEEKDAY_LABELS;
}

/** Local 'YYYY-MM-DD' for a Date, avoiding UTC drift from toISOString(). */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** MonthKey for the system "today". */
export function currentMonthKey(now: Date = new Date()): MonthKey {
  return { year: now.getFullYear(), month: now.getMonth() };
}

/** Returns the previous/next month, wrapping across year boundaries. */
export function shiftMonth(key: MonthKey, delta: number): MonthKey {
  const base = new Date(key.year, key.month + delta, 1);
  return { year: base.getFullYear(), month: base.getMonth() };
}

/** True when a < b at month granularity. */
export function isMonthBefore(a: MonthKey, b: MonthKey): boolean {
  return a.year < b.year || (a.year === b.year && a.month < b.month);
}

/** Human label like "2026년 6월". */
export function formatMonthLabel(key: MonthKey): string {
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' }).format(
    new Date(key.year, key.month, 1),
  );
}

/**
 * Builds a 6-row (42-cell) grid for a month, padded with leading/trailing
 * days from adjacent months so the grid always aligns to a Sun–Sat week.
 */
export function buildMonthGrid(key: MonthKey, today: Date = new Date()): MonthCell[] {
  const firstOfMonth = new Date(key.year, key.month, 1);
  const startOffset = firstOfMonth.getDay(); // 0 = Sunday
  const gridStart = new Date(key.year, key.month, 1 - startOffset);

  const todayKey = toDateKey(today);
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const dateKey = toDateKey(cellDate);
    cells.push({
      date: dateKey,
      dayOfMonth: cellDate.getDate(),
      inCurrentMonth: cellDate.getMonth() === key.month && cellDate.getFullYear() === key.year,
      isToday: dateKey === todayKey,
      isPast: cellDate.getTime() < todayMidnight,
    });
  }
  return cells;
}

/** Index calendar days by their date string for O(1) availability lookups. */
export function indexByDate(calendar: CalendarDay[]): Map<string, CalendarDay> {
  const map = new Map<string, CalendarDay>();
  for (const day of calendar) {
    map.set(day.date, day);
  }
  return map;
}

/** The earliest month present in the calendar payload, or null when empty. */
export function earliestMonth(calendar: CalendarDay[]): MonthKey | null {
  if (calendar.length === 0) return null;
  let min = calendar[0].date;
  for (const day of calendar) {
    if (day.date < min) min = day.date;
  }
  const [y, m] = min.split('-').map(Number);
  return { year: y, month: m - 1 };
}

/** The latest month present in the calendar payload, or null when empty. */
export function latestMonth(calendar: CalendarDay[]): MonthKey | null {
  if (calendar.length === 0) return null;
  let max = calendar[0].date;
  for (const day of calendar) {
    if (day.date > max) max = day.date;
  }
  const [y, m] = max.split('-').map(Number);
  return { year: y, month: m - 1 };
}
