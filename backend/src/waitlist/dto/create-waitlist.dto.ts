import { IsEnum, IsString } from 'class-validator';
import { SubjectType } from '@prisma/client';

/**
 * Body for POST /waitlist (AC10). The customer joins a counselor's waitlist on
 * behalf of a subject (self or an owned family member).
 */
export class CreateWaitlistDto {
  @IsString()
  counselorId!: string;

  @IsEnum(SubjectType)
  subjectType!: SubjectType;

  @IsString()
  subjectId!: string;
}
