import { IsString, MaxLength, MinLength } from 'class-validator';

/** Body for POST /qa/sessions/:id/messages (AC2). One free-text question. */
export class AskQuestionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  question!: string;
}
