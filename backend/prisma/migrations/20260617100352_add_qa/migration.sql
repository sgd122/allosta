-- CreateEnum
CREATE TYPE "QaMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "QaMessageSource" AS ENUM ('LLM', 'FALLBACK_UNAVAILABLE', 'FALLBACK_TIMEOUT', 'FALLBACK_SATURATED', 'FALLBACK_GUARDRAIL');

-- CreateEnum
CREATE TYPE "QaFeedback" AS ENUM ('YES', 'NO');

-- CreateTable
CREATE TABLE "QaSession" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "subjectType" "SubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "testResultId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QaSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QaMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "QaMessageRole" NOT NULL,
    "text" TEXT NOT NULL,
    "groundedMetricRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" "QaMessageSource",
    "inScope" BOOLEAN,
    "feedback" "QaFeedback",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QaMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QaSession_customerId_idx" ON "QaSession"("customerId");

-- CreateIndex
CREATE INDEX "QaSession_customerId_createdAt_idx" ON "QaSession"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "QaSession_subjectType_subjectId_idx" ON "QaSession"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "QaMessage_sessionId_createdAt_idx" ON "QaMessage"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "QaSession" ADD CONSTRAINT "QaSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaSession" ADD CONSTRAINT "QaSession_testResultId_fkey" FOREIGN KEY ("testResultId") REFERENCES "TestResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaMessage" ADD CONSTRAINT "QaMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "QaSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
