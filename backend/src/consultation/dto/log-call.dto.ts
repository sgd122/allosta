import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CallOutcome } from '@prisma/client';

/**
 * Body for POST /counselor/bookings/:bookingId/calls (contact surfacing, ADR 0016).
 * Records one click-to-call attempt as evidence for a possible no-show override.
 *
 * `outcome` is a forced enum (CONNECTED | NO_ANSWER | INVALID) — never free-text
 * classification — so admin analytics can aggregate attempts without reading the
 * note. `note` is an optional short memo, length-bounded identically to
 * Booking.concern (@MaxLength(1000)); it is PII-adjacent and is never logged or
 * surfaced in any aggregation.
 */
export class LogCallDto {
  @ApiProperty({ enum: CallOutcome, description: 'Call attempt result' })
  @IsEnum(CallOutcome)
  outcome!: CallOutcome;

  @ApiProperty({
    required: false,
    description: 'Optional short memo about the call (never logged or aggregated)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/**
 * Body for PATCH /counselor/bookings/:bookingId/calls/:callId (ADR 0016).
 * Edits a previously logged call so a counselor can fix a mis-clicked outcome
 * or refine the memo. Same shape and bounds as {@link LogCallDto} — only
 * `outcome` + `note` are mutable; the row's booking/counselor binding and
 * createdAt are immutable. Editing an outcome recomputes analytics live
 * (aggregates are computed on read), so there is no migration/backfill.
 */
export class UpdateCallLogDto {
  @ApiProperty({ enum: CallOutcome, description: 'Corrected call attempt result' })
  @IsEnum(CallOutcome)
  outcome!: CallOutcome;

  @ApiProperty({
    required: false,
    description: 'Optional short memo about the call (never logged or aggregated)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
