-- Customer temporal self-overlap guard (ADR 0015).
--
-- The partial unique index `booking_slot_active_unique` only stops two ACTIVE
-- bookings on the SAME slotId. It does NOT stop one customer from holding two
-- ACTIVE bookings on DIFFERENT slots (e.g. two counselors) at the same or
-- overlapping time. A person cannot attend two consultations at once. Slot
-- durations vary (30/60min), so this must be a time-RANGE overlap, enforced as a
-- Postgres GiST EXCLUDE constraint mirroring the rigor of the slot index.
--
-- The constraint must range over a single Booking row, so the slot window is
-- denormalized onto Booking.slotStartAt / slotEndAt (write-once at create()).
--
-- Column type note: AvailabilitySlot.startAt/endAt are TIMESTAMP(3) (timestamp
-- WITHOUT time zone), so the constraint uses tsrange (not tstzrange) to match the
-- column type exactly and avoid an implicit, session-timezone-dependent cast.

-- 1) GiST needs btree_gist to put the scalar equality column (customerId) and the
--    range column in the same exclusion constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2) Denormalized slot window. Added nullable first so existing rows can be
--    backfilled before the NOT NULL tightening.
ALTER TABLE "Booking"
  ADD COLUMN "slotStartAt" TIMESTAMP(3),
  ADD COLUMN "slotEndAt" TIMESTAMP(3);

-- 3) Backfill from the booked slot.
UPDATE "Booking" b
  SET "slotStartAt" = s."startAt",
      "slotEndAt" = s."endAt"
  FROM "AvailabilitySlot" s
  WHERE s.id = b."slotId";

-- 4) Tighten to NOT NULL now that every row has a window.
ALTER TABLE "Booking"
  ALTER COLUMN "slotStartAt" SET NOT NULL,
  ALTER COLUMN "slotEndAt" SET NOT NULL;

-- 5) Partial GiST EXCLUDE constraint: for ACTIVE bookings (PENDING/CONFIRMED),
--    no two rows may share a customerId AND have overlapping [slotStartAt, slotEndAt)
--    windows. Half-open '[)' bound means back-to-back bookings (10-11, 11-12) do
--    NOT overlap. CANCELLED/COMPLETED/NO_SHOW leave the constraint, so rebooking
--    an overlapping time after cancelling is allowed (mirrors booking_slot_active_unique).
ALTER TABLE "Booking" ADD CONSTRAINT "booking_customer_no_overlap"
  EXCLUDE USING gist (
    "customerId" WITH =,
    tsrange("slotStartAt", "slotEndAt") WITH &&
  )
  WHERE ("status" IN ('PENDING', 'CONFIRMED'));
