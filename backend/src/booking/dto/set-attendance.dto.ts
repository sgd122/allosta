import { IsIn } from 'class-validator';
import { BookingStatus } from '@prisma/client';

/**
 * Body for PATCH /bookings/:id/attendance (AC-N4).
 * Counselors may override the auto-sweep decision in either direction.
 * NO_SHOW: unrecorded consult treated as absent.
 * COMPLETED: counselor confirms session happened (record not required for override).
 */
export class SetAttendanceDto {
  @IsIn([BookingStatus.NO_SHOW, BookingStatus.COMPLETED])
  status!: BookingStatus;
}
