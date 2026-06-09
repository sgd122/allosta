-- Structured consultation record: split free-text notes into summary/recommendation/followUp
-- and add a consultation-action checklist for cross-counselor consistency + funnel analytics.
CREATE TYPE "ConsultationActionType" AS ENUM (
  'METRIC_EXPLAINED', 'DIET_GUIDANCE', 'SUPPLEMENT_GUIDANCE', 'RETEST_GUIDANCE', 'LIFESTYLE_GUIDANCE'
);

ALTER TABLE "ConsultationRecord" ADD COLUMN "summary" TEXT;
ALTER TABLE "ConsultationRecord" ADD COLUMN "recommendation" TEXT;
ALTER TABLE "ConsultationRecord" ADD COLUMN "followUp" TEXT;
ALTER TABLE "ConsultationRecord" ADD COLUMN "actions" "ConsultationActionType"[] NOT NULL DEFAULT ARRAY[]::"ConsultationActionType"[];

-- Backfill existing rows from the legacy free-text notes
UPDATE "ConsultationRecord" SET "summary" = "notes" WHERE "summary" IS NULL;
UPDATE "ConsultationRecord" SET "recommendation" = '' WHERE "recommendation" IS NULL;

ALTER TABLE "ConsultationRecord" ALTER COLUMN "summary" SET NOT NULL;
ALTER TABLE "ConsultationRecord" ALTER COLUMN "recommendation" SET NOT NULL;

ALTER TABLE "ConsultationRecord" DROP COLUMN "notes";
