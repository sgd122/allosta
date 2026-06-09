-- Booking redesign (PENDING-first flow + testResult linkage + widened concurrency guard).
--
-- 1) testResultId: the consultation's selected test result. Nullable + FK with
--    ON DELETE SET NULL (a deleted result must not delete the booking history).
ALTER TABLE "Booking" ADD COLUMN "testResultId" TEXT;

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_testResultId_fkey"
  FOREIGN KEY ("testResultId") REFERENCES "TestResult"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Booking_testResultId_idx" ON "Booking"("testResultId");

-- 2) New bookings default to PENDING (customer requested, counselor not yet confirmed).
ALTER TABLE "Booking" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- 3) Widen the partial unique index from {CONFIRMED} to the ACTIVE set
--    {PENDING, CONFIRMED} so two customers cannot both preempt one slot (AC15).
--    CANCELLED and COMPLETED leave the index, reopening the slot.
DROP INDEX "booking_slot_confirmed_unique";

CREATE UNIQUE INDEX "booking_slot_active_unique"
  ON "Booking"("slotId") WHERE "status" IN ('PENDING', 'CONFIRMED');
