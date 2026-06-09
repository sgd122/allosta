import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, ValidateNested } from 'class-validator';

/**
 * A single availability slot to create (AC-S1).
 */
export class CreateSlotDto {
  @ApiProperty({ description: 'Slot start time (ISO 8601)' })
  @IsDateString()
  startAt!: string;

  @ApiProperty({ description: 'Slot end time (ISO 8601)' })
  @IsDateString()
  endAt!: string;
}

/**
 * Body for POST /counselors/slots — one or more slots, all-or-nothing (AC-S1).
 */
export class CreateSlotBatchDto {
  @ApiProperty({ type: [CreateSlotDto], description: 'One or more slots to create' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSlotDto)
  slots!: CreateSlotDto[];
}
