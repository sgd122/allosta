import { IsString } from 'class-validator';

/**
 * Body for POST /bookings (AC1/AC3/AC8/AC11). The customer books `slotId` for a
 * test result; the subject (self or an owned family member) is derived
 * server-side from the test result, then ownership is re-verified.
 */
export class CreateBookingDto {
  @IsString()
  slotId!: string;

  @IsString()
  testResultId!: string;
}
