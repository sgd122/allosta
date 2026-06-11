import type { BookingStatus } from '@/shared/config';
import type { StatusConfig } from '../types';

export const STATUS_CONFIG: Record<BookingStatus, StatusConfig> = {
  PENDING:   { label: '예약중',   color: 'amber', variant: 'soft' },
  CONFIRMED: { label: '예약완료', color: 'teal',  variant: 'soft' },
  CANCELLED: { label: '취소',     color: 'gray',  variant: 'soft' },
  COMPLETED: { label: '완료',     color: 'teal',  variant: 'solid' },
  NO_SHOW:   { label: '노쇼',     color: 'gray',  variant: 'soft' },
};

export const CANCELLABLE: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  'PENDING',
  'CONFIRMED',
]);
