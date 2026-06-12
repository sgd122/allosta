import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for POST /bookings (AC1/AC3/AC8/AC11). The customer books `slotId` for a
 * test result; the subject (self or an owned family member) is derived
 * server-side from the test result, then ownership is re-verified.
 *
 * `concern` is an optional pre-question stored for the counselor brief (write-only).
 */
export class CreateBookingDto {
  @IsString()
  slotId!: string;

  @IsString()
  testResultId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  concern?: string;
}
