-- Ops hardening: advisory TTL offer fields on Waitlist.
--
-- FORWARD-ONLY: depends on EXPIRED enum value added in migration
-- 20260610000000_ops_enum_add (committed in a prior transaction).
-- Rollback = restore from backup.
--
-- offeredSlotId: FK → AvailabilitySlot; nullable (null when not in NOTIFIED state).
--   ON DELETE SET NULL so a deleted slot clears the offer without cascading.
-- offerExpiresAt: UTC timestamp when the NOTIFIED offer expires (null when not offered).
-- Index on (status, offerExpiresAt): used by WaitlistService.sweepWaitlistOffers()
--   to efficiently find NOTIFIED rows past their TTL.
ALTER TABLE "Waitlist" ADD COLUMN "offeredSlotId" TEXT;
ALTER TABLE "Waitlist" ADD COLUMN "offerExpiresAt" TIMESTAMP(3);

ALTER TABLE "Waitlist"
  ADD CONSTRAINT "Waitlist_offeredSlotId_fkey"
  FOREIGN KEY ("offeredSlotId") REFERENCES "AvailabilitySlot"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Waitlist_status_offerExpiresAt_idx" ON "Waitlist"("status", "offerExpiresAt");
