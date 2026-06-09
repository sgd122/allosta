-- Partial unique index: at most one CONFIRMED Booking per slot (AC2).
-- Prisma cannot express partial unique indexes in schema.prisma, so this is
-- added via raw SQL. Allows a CANCELLED booking's slot to be re-booked while
-- preventing duplicate confirmations. Enforced atomically by Postgres; booking
-- creation maps the unique violation (SQLSTATE 23505) to 409 ConflictException.
CREATE UNIQUE INDEX "booking_slot_confirmed_unique" ON "Booking"("slotId") WHERE "status" = 'CONFIRMED';
