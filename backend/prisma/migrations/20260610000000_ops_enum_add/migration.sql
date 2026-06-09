-- Ops hardening: add NO_SHOW to BookingStatus and EXPIRED to WaitlistStatus.
--
-- FORWARD-ONLY: Postgres ALTER TYPE ... ADD VALUE IF NOT EXISTS commits the new
-- enum label unconditionally and cannot be reversed without a full backup restore.
-- Rollback = restore from backup (consistent with existing irreversible enum migrations).
--
-- MUST be its own migration: Postgres forbids *using* a newly-added enum value
-- in the same transaction that adds it. The next migration (waitlist_offer_fields)
-- references EXPIRED in an index predicate column — splitting guarantees these
-- values are committed before any statement that references them.
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'NO_SHOW';
ALTER TYPE "WaitlistStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
