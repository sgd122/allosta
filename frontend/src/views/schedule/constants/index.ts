import type { Outcome, BookingStatus } from '@/shared/config';
import type { DateScope } from '@/shared/lib/date';
import type { BookingBadgeConfig, StatusFilter } from '../types';

export const OUTCOME_COLOR: Record<Outcome, 'teal' | 'amber' | 'gray'> = {
  EXPLAINED: 'gray',
  GUIDED: 'amber',
  PURCHASED: 'teal',
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  EXPLAINED: '결과 설명',
  GUIDED: '영양제 안내',
  PURCHASED: '구매',
};

export const BOOKING_STATUS_BADGE: Record<BookingStatus, BookingBadgeConfig> = {
  PENDING:   { label: '예약중',   color: 'amber', variant: 'soft' },
  CONFIRMED: { label: '예약완료', color: 'teal',  variant: 'soft' },
  COMPLETED: { label: '완료',     color: 'teal',  variant: 'solid' },
  CANCELLED: { label: '취소',     color: 'gray',  variant: 'soft' },
  NO_SHOW:   { label: '노쇼',     color: 'gray',  variant: 'soft' },
};

/** Date-scope segmented control options for the schedule toolbar (req: today/by-date). */
export const SCHEDULE_SCOPE_OPTIONS: { value: DateScope; label: string }[] = [
  { value: 'today',    label: '오늘' },
  { value: 'upcoming', label: '예정' },
  { value: 'past',     label: '지난' },
  { value: 'all',      label: '전체' },
];

/**
 * Booking-status filter options. `ALL` is the catch-all; the rest map 1:1 onto
 * BookingStatus values the schedule can surface (NO_SHOW now included so missed
 * sessions are filterable). CANCELLED never reaches the schedule, so it is omitted.
 */
export const SCHEDULE_STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL',       label: '전체' },
  { value: 'PENDING',   label: '예약중' },
  { value: 'CONFIRMED', label: '예약완료' },
  { value: 'COMPLETED', label: '완료' },
  { value: 'NO_SHOW',   label: '노쇼' },
];
