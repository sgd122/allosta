-- Additive migration: FamilyLink table + FamilyMember.userId nullable column.
-- DOES NOT touch Booking, the partial unique index, or (subjectType,subjectId)
-- TestResult mapping. All existing rows, constraints, and indexes are preserved.

-- CreateEnum
CREATE TYPE "FamilyLinkStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- AlterTable: add nullable userId to FamilyMember (existing rows get NULL)
ALTER TABLE "FamilyMember" ADD COLUMN "userId" TEXT;

-- CreateIndex: unique constraint on FamilyMember.userId (nulls allowed — only
-- non-null values are enforced unique by Postgres)
CREATE UNIQUE INDEX "FamilyMember_userId_key" ON "FamilyMember"("userId");

-- AddForeignKey: FamilyMember.userId → User.id (SET NULL on delete so
-- deleting the User account unlinks without removing the FamilyMember row)
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: FamilyLink
CREATE TABLE "FamilyLink" (
    "id"                   TEXT NOT NULL,
    "guardianCustomerId"   TEXT NOT NULL,
    "memberFamilyMemberId" TEXT NOT NULL,
    "code"                 TEXT NOT NULL,
    "status"               "FamilyLinkStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt"            TIMESTAMP(3) NOT NULL,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt"           TIMESTAMP(3),

    CONSTRAINT "FamilyLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique invite code
CREATE UNIQUE INDEX "FamilyLink_code_key" ON "FamilyLink"("code");

-- CreateIndex: lookup indexes
CREATE INDEX "FamilyLink_guardianCustomerId_idx"   ON "FamilyLink"("guardianCustomerId");
CREATE INDEX "FamilyLink_memberFamilyMemberId_idx" ON "FamilyLink"("memberFamilyMemberId");
CREATE INDEX "FamilyLink_code_idx"                 ON "FamilyLink"("code");
CREATE INDEX "FamilyLink_status_idx"               ON "FamilyLink"("status");

-- AddForeignKey: FamilyLink.guardianCustomerId → Customer.id
ALTER TABLE "FamilyLink" ADD CONSTRAINT "FamilyLink_guardianCustomerId_fkey"
  FOREIGN KEY ("guardianCustomerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: FamilyLink.memberFamilyMemberId → FamilyMember.id
ALTER TABLE "FamilyLink" ADD CONSTRAINT "FamilyLink_memberFamilyMemberId_fkey"
  FOREIGN KEY ("memberFamilyMemberId") REFERENCES "FamilyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
