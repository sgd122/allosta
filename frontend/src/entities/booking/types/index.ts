import type { SubjectType, BookingStatus } from '@/shared/config';

export interface Slot {
  id: string;
  startAt: string;
  endAt: string;
}

export interface Booking {
  id: string;
  slotId: string;
  subjectType: SubjectType;
  subjectId: string;
  status?: BookingStatus;
}

export interface AggregatedSlot {
  slotId: string;
  counselorId: string;
  startAt: string;
  endAt: string;
  /** How many counselors are still free for this time window. */
  availableCount: number;
}

export interface CalendarDay {
  date: string;
  slots: AggregatedSlot[];
}

export interface MyBooking {
  id: string;
  status: BookingStatus;
  slot: { startAt: string; endAt: string };
  subjectType: SubjectType;
  subjectId: string;
  testResultId: string | null;
  serviceType: string | null;
}

export interface BookingCalendarProps {
  calendar: CalendarDay[] | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  /** Opens the booking modal for the chosen time range. */
  onPickSlot: (slot: AggregatedSlot) => void;
}

export interface DayCellProps {
  dayOfMonth: number;
  muted: boolean;
  isToday: boolean;
  isAvailable: boolean;
  isSelected: boolean;
  slotCount: number;
  onSelect: () => void;
}

export interface TimeButtonProps {
  slot: AggregatedSlot;
  onPick: () => void;
}
