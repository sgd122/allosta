import type { SubjectType, BookingStatus } from '@/shared/config';

export interface ScheduleEntry {
  bookingId: string;
  slot: { startAt: string; endAt: string };
  subjectType: SubjectType;
  subjectId: string;
  subjectName: string;
  customerId: string;
  customerName: string;
  hasRecord: boolean;
  status: BookingStatus;
}
