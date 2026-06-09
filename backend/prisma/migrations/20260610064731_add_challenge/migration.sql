-- CreateEnum
CREATE TYPE "ChallengeEnrollmentStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'DROPPED');

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "linkedServiceType" TEXT,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeEnrollment" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "counselorId" TEXT NOT NULL,
    "status" "ChallengeEnrollmentStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChallengeEnrollment_challengeId_idx" ON "ChallengeEnrollment"("challengeId");

-- CreateIndex
CREATE INDEX "ChallengeEnrollment_customerId_idx" ON "ChallengeEnrollment"("customerId");

-- CreateIndex
CREATE INDEX "ChallengeEnrollment_counselorId_idx" ON "ChallengeEnrollment"("counselorId");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeEnrollment_recordId_key" ON "ChallengeEnrollment"("recordId");

-- AddForeignKey
ALTER TABLE "ChallengeEnrollment" ADD CONSTRAINT "ChallengeEnrollment_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeEnrollment" ADD CONSTRAINT "ChallengeEnrollment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeEnrollment" ADD CONSTRAINT "ChallengeEnrollment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ConsultationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeEnrollment" ADD CONSTRAINT "ChallengeEnrollment_counselorId_fkey" FOREIGN KEY ("counselorId") REFERENCES "Counselor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
