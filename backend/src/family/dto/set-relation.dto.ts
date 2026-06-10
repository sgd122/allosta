import { IsString, MaxLength } from 'class-validator';

/**
 * Body for PATCH /family/links/:id/relation.
 * The caller sets a free-form label describing how the counterpart relates to
 * THEM (e.g. "엄마", "배우자", "트레이너"). Each side sets their own label.
 * An empty string clears the label.
 */
export class SetRelationDto {
  @IsString()
  @MaxLength(20, { message: '관계 라벨은 20자 이하로 입력해 주세요.' })
  relation!: string;
}
