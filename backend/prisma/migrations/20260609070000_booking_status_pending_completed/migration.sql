-- Add the two new BookingStatus values for the PENDING-first booking flow.
-- This MUST be its own migration: Postgres forbids using a newly-added enum
-- value in the same transaction that adds it, and the next migration
-- (booking_pending_first) references 'PENDING' in a DEFAULT and an index
-- predicate. Splitting guarantees these values are committed first.
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
