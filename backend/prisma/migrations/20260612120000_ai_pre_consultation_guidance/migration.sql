-- Replace the post-consultation AI summary (recordId-keyed) with the
-- pre-consultation AI guidance (bookingId-keyed). The old table held only
-- throwaway demo data (ADR 0014 redesign), so a drop/recreate is safe.

-- DropTable (post-consultation summary)
DROP TABLE IF EXISTS "ConsultationAiSummary" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "AiSummaryStatus";

-- CreateEnum
CREATE TYPE "BriefGuidanceStatus" AS ENUM ('FALLBACK', 'UPGRADED');

-- CreateTable
CREATE TABLE "ConsultationBriefGuidance" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "status" "BriefGuidanceStatus" NOT NULL DEFAULT 'FALLBACK',
    "model" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultationBriefGuidance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationBriefGuidance_bookingId_key" ON "ConsultationBriefGuidance"("bookingId");

-- AddForeignKey
ALTER TABLE "ConsultationBriefGuidance" ADD CONSTRAINT "ConsultationBriefGuidance_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
