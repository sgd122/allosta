-- Deterministic turn ordering for QaMessage (ADR 0018).
--
-- The USER and ASSISTANT rows of a single turn are persisted inside one
-- $transaction, so both inherit the same CURRENT_TIMESTAMP. Ordering a thread
-- by createdAt alone therefore has no defined order between the two rows, which
-- can surface the answer before its question and scramble multi-turn history.
-- A monotonic SERIAL gives a stable, insert-ordered sort key.

-- DropIndex
DROP INDEX "QaMessage_sessionId_createdAt_idx";

-- AlterTable
ALTER TABLE "QaMessage" ADD COLUMN "seq" SERIAL NOT NULL;

-- CreateIndex
CREATE INDEX "QaMessage_sessionId_seq_idx" ON "QaMessage"("sessionId", "seq");
