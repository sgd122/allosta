import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Body for POST /qa/sessions (AC1). Opens a Q&A session scoped to a report.
 *
 * `testResultId` is a Prisma CUID (`@default(cuid())`), NOT a UUID — so it is
 * bounded by length rather than UUID-validated. An unknown-but-well-formed id
 * resolves to a 404 in the service (the column is a plain String, so a malformed
 * value never reaches a native-UUID cast). The MaxLength bound rejects oversized
 * input at the boundary before any DB lookup.
 */
export class CreateQaSessionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  testResultId!: string;
}
