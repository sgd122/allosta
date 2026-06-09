-- Symmetric FamilyLink redesign — Customer↔Customer (plan: family-link-symmetric-redesign).
--
-- Replaces the asymmetric guardian→FamilyMember model with a symmetric
-- Customer↔Customer model. Drops FamilyMember table, removes FAMILY_MEMBER
-- from the SubjectType enum, and recreates FamilyLink with the new fields.
--
-- Partial unique index for ACCEPTED pairs (PENDING rows have null invitee so
-- normalization is deferred to accept time):
--   CREATE UNIQUE INDEX "family_link_accepted_pair_unique"
--     ON "FamilyLink"("customerLowId","customerHighId") WHERE status = 'ACCEPTED';

-- Step 1: Drop old FamilyLink table (has FK to FamilyMember which we are removing).
DROP TABLE IF EXISTS "FamilyLink" CASCADE;

-- Step 2: Drop FamilyMember table and all associated constraints/indexes.
DROP TABLE IF EXISTS "FamilyMember" CASCADE;

-- Step 3: Remove FAMILY_MEMBER from SubjectType enum.
-- PostgreSQL does not support ALTER TYPE ... DROP VALUE, so we recreate the enum.
ALTER TYPE "SubjectType" RENAME TO "SubjectType_old";
CREATE TYPE "SubjectType" AS ENUM ('CUSTOMER');
ALTER TABLE "TestResult" ALTER COLUMN "subjectType" TYPE "SubjectType" USING ("subjectType"::text::"SubjectType");
ALTER TABLE "Booking"    ALTER COLUMN "subjectType" TYPE "SubjectType" USING ("subjectType"::text::"SubjectType");
ALTER TABLE "Waitlist"   ALTER COLUMN "subjectType" TYPE "SubjectType" USING ("subjectType"::text::"SubjectType");
DROP TYPE "SubjectType_old";

-- Step 4: Create new symmetric FamilyLink table.
CREATE TABLE "FamilyLink" (
    "id"                TEXT NOT NULL,
    "inviterCustomerId" TEXT NOT NULL,
    "inviteeCustomerId" TEXT,
    "customerLowId"     TEXT,
    "customerHighId"    TEXT,
    "relationLowToHigh" TEXT,
    "relationHighToLow" TEXT,
    "code"              TEXT NOT NULL,
    "status"            "FamilyLinkStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt"         TIMESTAMP(3) NOT NULL,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt"        TIMESTAMP(3),

    CONSTRAINT "FamilyLink_pkey" PRIMARY KEY ("id")
);

-- Unique invite code
CREATE UNIQUE INDEX "FamilyLink_code_key" ON "FamilyLink"("code");

-- Lookup indexes
CREATE INDEX "FamilyLink_inviterCustomerId_idx" ON "FamilyLink"("inviterCustomerId");
CREATE INDEX "FamilyLink_inviteeCustomerId_idx" ON "FamilyLink"("inviteeCustomerId");
CREATE INDEX "FamilyLink_code_idx"              ON "FamilyLink"("code");
CREATE INDEX "FamilyLink_status_idx"            ON "FamilyLink"("status");

-- Foreign keys
ALTER TABLE "FamilyLink" ADD CONSTRAINT "FamilyLink_inviterCustomerId_fkey"
  FOREIGN KEY ("inviterCustomerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FamilyLink" ADD CONSTRAINT "FamilyLink_inviteeCustomerId_fkey"
  FOREIGN KEY ("inviteeCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 5: Partial unique index — at most one ACCEPTED link per normalized pair.
-- Prisma cannot express WHERE-clause indexes, so this is raw SQL (same pattern
-- as booking_slot_active_unique in the header comment of schema.prisma).
CREATE UNIQUE INDEX "family_link_accepted_pair_unique"
  ON "FamilyLink"("customerLowId", "customerHighId") WHERE status = 'ACCEPTED';
