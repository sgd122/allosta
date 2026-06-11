import type { ScheduleEntry } from '@/entities/schedule';
import type { CounselorRecordEntry } from '@/entities/consultation-record';
import type { BookingStatus } from '@/shared/config';

export type BookingBadgeConfig = {
  label: string;
  color: 'amber' | 'teal' | 'gray';
  variant: 'soft' | 'solid';
};

/**
 * Status filter selection: either every surfaced status (`ALL`) or one specific
 * BookingStatus. Excludes CANCELLED, which the schedule endpoint never returns.
 */
export type StatusFilter = 'ALL' | Exclude<BookingStatus, 'CANCELLED'>;

export type RowProps = {
  entry: ScheduleEntry;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
  onRecorded: () => void;
  existingRecord: CounselorRecordEntry | undefined;
};
