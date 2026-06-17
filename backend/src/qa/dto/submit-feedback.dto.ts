import { IsEnum } from 'class-validator';
import { QaFeedback } from '@prisma/client';

/** Body for PATCH /qa/messages/:id/feedback (AC7). */
export class SubmitFeedbackDto {
  @IsEnum(QaFeedback)
  feedback!: QaFeedback;
}
