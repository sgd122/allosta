import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

/**
 * Body for PATCH /slots/:id — partial update of a slot's operational flag or time window (AC-S1).
 * At least one field should be provided; all are optional.
 */
export class UpdateSlotDto {
  @ApiProperty({ required: false, description: 'Open/close the slot operationally' })
  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;

  @ApiProperty({ required: false, description: 'New start time (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @ApiProperty({ required: false, description: 'New end time (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endAt?: string;
}
