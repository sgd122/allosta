import type { DateScope } from '@/shared/lib/date';

/**
 * Date-scope options for the availability toolbar. The backend only returns
 * slots whose end is still in the future (findOwnSlots), so a 지난(past) lens
 * would be near-empty — we offer 오늘 / 예정 / 전체 instead.
 */
export const AVAILABILITY_SCOPE_OPTIONS: { value: DateScope; label: string }[] = [
  { value: 'today',    label: '오늘' },
  { value: 'upcoming', label: '예정' },
  { value: 'all',      label: '전체' },
];
