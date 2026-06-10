import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ConsultationActionType, Outcome } from '@prisma/client';

/**
 * A single discussed test metric the counselor links to the record (R5/AC9).
 * The referenced TestResult's subject must match the booking's subject — that
 * ownership reuse is enforced in the service, not here.
 */
export class MetricRefDto {
  @ApiProperty({ description: 'TestResult id whose metric was discussed' })
  @IsString()
  testResultId!: string;

  @ApiProperty({ description: 'Key inside TestResult.metrics that was discussed' })
  @IsString()
  metricKey!: string;
}

export class CreateConsultationRecordDto {
  @ApiProperty({ description: 'Booking this record documents (must be the counselor\'s own)' })
  @IsString()
  bookingId!: string;

  @ApiProperty({ description: 'Main consultation content (주요 상담 내용)' })
  @IsString()
  @IsNotEmpty({ message: '주요 상담 내용은 필수입니다.' })
  summary!: string;

  @ApiProperty({ description: 'Recommendation given to the subject (권고 사항)' })
  @IsString()
  @IsNotEmpty({ message: '권고 사항은 필수입니다.' })
  recommendation!: string;

  @ApiProperty({ required: false, description: 'Follow-up actions (후속 조치)' })
  @IsOptional()
  @IsString()
  followUp?: string;

  @ApiProperty({
    enum: ConsultationActionType,
    isArray: true,
    description: 'Consultation-action checklist (상담 행위 체크리스트)',
  })
  @IsArray()
  @IsEnum(ConsultationActionType, { each: true })
  actions!: ConsultationActionType[];

  @ApiProperty({ enum: Outcome, description: 'Consultation outcome' })
  @IsEnum(Outcome)
  outcome!: Outcome;

  @ApiProperty({ type: [String], description: 'Product ids the subject is interested in' })
  @IsArray()
  @IsString({ each: true })
  interestedProductIds!: string[];

  @ApiProperty({
    type: [MetricRefDto],
    required: false,
    description: 'Test metrics discussed during the consultation (R5/AC9)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetricRefDto)
  metricRefs?: MetricRefDto[];

  @ApiProperty({
    required: false,
    description:
      'Optional challenge to enroll the customer into during record creation (R6/AC4)',
  })
  @IsOptional()
  @IsString()
  challengeId?: string;
}

/**
 * Updates an existing consultation record. The record is identified by its id
 * in the route, so `bookingId` is not part of the payload — the booking and its
 * subject are resolved server-side. Products and metrics are replaced wholesale.
 */
export class UpdateConsultationRecordDto {
  @ApiProperty({ description: 'Main consultation content (주요 상담 내용)' })
  @IsString()
  @IsNotEmpty({ message: '주요 상담 내용은 필수입니다.' })
  summary!: string;

  @ApiProperty({ description: 'Recommendation given to the subject (권고 사항)' })
  @IsString()
  @IsNotEmpty({ message: '권고 사항은 필수입니다.' })
  recommendation!: string;

  @ApiProperty({ required: false, description: 'Follow-up actions (후속 조치)' })
  @IsOptional()
  @IsString()
  followUp?: string;

  @ApiProperty({
    enum: ConsultationActionType,
    isArray: true,
    description: 'Consultation-action checklist (상담 행위 체크리스트)',
  })
  @IsArray()
  @IsEnum(ConsultationActionType, { each: true })
  actions!: ConsultationActionType[];

  @ApiProperty({ enum: Outcome, description: 'Consultation outcome' })
  @IsEnum(Outcome)
  outcome!: Outcome;

  @ApiProperty({ type: [String], description: 'Product ids the subject is interested in' })
  @IsArray()
  @IsString({ each: true })
  interestedProductIds!: string[];

  @ApiProperty({
    type: [MetricRefDto],
    required: false,
    description: 'Test metrics discussed during the consultation (R5/AC9)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetricRefDto)
  metricRefs?: MetricRefDto[];
}
