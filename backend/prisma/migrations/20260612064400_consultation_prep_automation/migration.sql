-- CreateEnum
CREATE TYPE "AiSummaryStatus" AS ENUM ('FALLBACK', 'UPGRADED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "briefOpenedAt" TIMESTAMP(3),
ADD COLUMN     "concern" TEXT;

-- CreateTable
CREATE TABLE "ConsultationAiSummary" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "status" "AiSummaryStatus" NOT NULL DEFAULT 'FALLBACK',
    "model" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultationAiSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationAiSummary_recordId_key" ON "ConsultationAiSummary"("recordId");

-- AddForeignKey
ALTER TABLE "ConsultationAiSummary" ADD CONSTRAINT "ConsultationAiSummary_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ConsultationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
