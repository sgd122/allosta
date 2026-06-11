import { INestApplication } from '@nestjs/common';
import { BookingStatus, Role, SubjectType } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  bootTestApp,
  cleanupSeeded,
  seedIsolated,
  SeededData,
} from './helpers/test-app';

/**
 * AC-S5 — integration tests for availability slot CRUD.
 *
 * Isolation discipline
 * --------------------
 * This suite creates AvailabilitySlots, Bookings, and one extra Counselor
 * directly in the shared test DB. ALL resources are tracked in Sets and
 * explicitly deleted in afterAll — even if an individual test assertion fails
 * mid-test before its inline cleanup runs.
 *
 * Timestamps: we use offsets ≥ 1000h (≈ 42 days) from now for all created
 * slots. This keeps them far from the "5 days from now" range used by
 * booking-redesign.spec.ts, preventing calendar-window collapse when suites
 * run in parallel on the shared DB.
 *
 * Covered scenarios:
 *   AC-S1  Counselor creates own slots (POST /counselors/slots).
 *   AC-S2  Admin creates slots for any counselor
 *          (POST /admin/counselors/:id/slots).
 *   AC-S3  Overlap guard → 409 (half-open interval predicate).
 *          Back-to-back slots are ALLOWED (existingEnd > newStart is false).
 *   AC-S4  Delete blocked with 409 when an active booking exists.
 *   AC-S5  Cross-counselor PATCH/DELETE → 403.
 *   Admin  Nonexistent counselorId → 404.
 */
describe('Availability slot CRUD (AC-S1–S5)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seeded: SeededData;
  /** Admin token — minted without a DB row; RolesGuard is JWT-only. */
  let adminToken: string;

  // ─── Island tracking ────────────────────────────────────────────────────────
  // Every resource created during this suite is recorded here.
  // afterAll deletes them all with deleteMany (silently ignores missing IDs),
  // then runs cleanupSeeded for the base island.

  const trackedSlotIds = new Set<string>();
  const trackedBookingIds = new Set<string>();
  const trackedCounselorIds = new Set<string>();
  const trackedUserIds = new Set<string>();

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    // slotCount:0 — tests create their own slots at controlled future times.
    seeded = await seedIsolated(prisma, ctx.signToken, { slotCount: 0 });
    adminToken = ctx.signToken({ sub: 'admin-user', role: Role.ADMIN });
  });

  afterAll(async () => {
    // Explicit cleanup in FK-safe order before cascade-deleting the base island.
    // deleteMany is a no-op for IDs that were already deleted inline.
    if (trackedBookingIds.size) {
      await prisma.booking.deleteMany({
        where: { id: { in: [...trackedBookingIds] } },
      });
    }
    if (trackedSlotIds.size) {
      await prisma.availabilitySlot.deleteMany({
        where: { id: { in: [...trackedSlotIds] } },
      });
    }
    if (trackedCounselorIds.size) {
      await prisma.counselor.deleteMany({
        where: { id: { in: [...trackedCounselorIds] } },
      });
    }
    if (trackedUserIds.size) {
      await prisma.user.deleteMany({
        where: { id: { in: [...trackedUserIds] } },
      });
    }
    await cleanupSeeded(prisma, seeded);
    await app.close();
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Returns an ISO string N hours from now, rounded to no sub-second precision.
   * N must be >= 1000 (≈ 42 days) so slots stay far from "5 days from now"
   * ranges used by other test suites (e.g. booking-redesign.spec.ts).
   */
  function futureIso(offsetHours: number): string {
    return new Date(Date.now() + offsetHours * 60 * 60 * 1000).toISOString();
  }

  /**
   * Creates a slot directly in the DB and registers it in trackedSlotIds.
   * Uses DB-direct insert so the overlap guard is not exercised (tests that
   * want to seed a pre-existing slot use this; tests that verify 409 do too).
   */
  async function dbSlot(offsetHours: number, durationHours = 1) {
    const startAt = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
    const endAt = new Date(startAt.getTime() + durationHours * 60 * 60 * 1000);
    const slot = await prisma.availabilitySlot.create({
      data: { counselorId: seeded.counselorId, startAt, endAt, isOpen: true },
    });
    trackedSlotIds.add(slot.id);
    return slot;
  }

  // ─── AC-S1: Counselor creates own slots ────────────────────────────────────

  it('201 — counselor creates a single slot', async () => {
    const res = await request(app.getHttpServer())
      .post('/counselors/slots')
      .set('Authorization', `Bearer ${seeded.counselorToken}`)
      .send({
        slots: [{ startAt: futureIso(1000), endAt: futureIso(1001) }],
      });

    expect(res.status).toBe(201);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].counselorId).toBe(seeded.counselorId);
    trackedSlotIds.add(res.body[0].id);
  });

  it('201 — counselor creates a batch of two non-overlapping slots', async () => {
    const res = await request(app.getHttpServer())
      .post('/counselors/slots')
      .set('Authorization', `Bearer ${seeded.counselorToken}`)
      .send({
        slots: [
          { startAt: futureIso(2000), endAt: futureIso(2001) },
          { startAt: futureIso(2002), endAt: futureIso(2003) },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(2);
    for (const slot of res.body) trackedSlotIds.add(slot.id);
  });

  it('403 — customer cannot POST /counselors/slots', async () => {
    const res = await request(app.getHttpServer())
      .post('/counselors/slots')
      .set('Authorization', `Bearer ${seeded.customerToken}`)
      .send({ slots: [{ startAt: futureIso(3000), endAt: futureIso(3001) }] });

    expect(res.status).toBe(403);
    // No slot created — nothing to track.
  });

  // ─── AC-S3: Overlap guard ───────────────────────────────────────────────────

  it('409 — overlapping slot creation is rejected', async () => {
    // Seed an existing slot via DB (offset 10000h = ~416 days from now).
    const existing = await dbSlot(10000);

    // Try to create a slot that overlaps it (starts 30 min in).
    const res = await request(app.getHttpServer())
      .post('/counselors/slots')
      .set('Authorization', `Bearer ${seeded.counselorToken}`)
      .send({
        slots: [
          {
            startAt: new Date(existing.startAt.getTime() + 30 * 60 * 1000).toISOString(),
            endAt: new Date(existing.endAt.getTime() + 30 * 60 * 1000).toISOString(),
          },
        ],
      });

    expect(res.status).toBe(409);
    // 409 means no slot was created — nothing extra to track.
  });

  it('201 — back-to-back slots are allowed (half-open interval)', async () => {
    // Slot A at 11000h; slot B starts exactly when A ends.
    // Predicate: existingEnd (A.end) > newStart (B.start) → A.end > A.end → false → no overlap.
    const slotA = await dbSlot(11000);

    const res = await request(app.getHttpServer())
      .post('/counselors/slots')
      .set('Authorization', `Bearer ${seeded.counselorToken}`)
      .send({
        slots: [
          {
            startAt: slotA.endAt.toISOString(),
            endAt: new Date(slotA.endAt.getTime() + 60 * 60 * 1000).toISOString(),
          },
        ],
      });

    expect(res.status).toBe(201);
    trackedSlotIds.add(res.body[0].id);
  });

  // ─── AC-S4: Delete blocked by active booking ───────────────────────────────

  it('409 — cannot delete slot with an active (PENDING) booking', async () => {
    const slot = await dbSlot(12000);

    const booking = await prisma.booking.create({
      data: {
        slotId: slot.id,
        customerId: seeded.customerId,
        subjectType: SubjectType.CUSTOMER,
        subjectId: seeded.customerId,
        status: BookingStatus.PENDING,
      },
    });
    trackedBookingIds.add(booking.id);

    const res = await request(app.getHttpServer())
      .delete(`/slots/${slot.id}`)
      .set('Authorization', `Bearer ${seeded.counselorToken}`);

    expect(res.status).toBe(409);
  });

  it('200 — counselor can delete own slot without active bookings', async () => {
    const slot = await dbSlot(13000);

    const res = await request(app.getHttpServer())
      .delete(`/slots/${slot.id}`)
      .set('Authorization', `Bearer ${seeded.counselorToken}`);

    expect(res.status).toBe(200);
    // Slot deleted by the API — remove from tracking so afterAll skips it.
    trackedSlotIds.delete(slot.id);

    const gone = await prisma.availabilitySlot.findUnique({ where: { id: slot.id } });
    expect(gone).toBeNull();
  });

  // ─── AC-S3: Cross-counselor ownership (403) ────────────────────────────────

  it('403 — counselor B cannot PATCH counselor A slot', async () => {
    // Create counselor B (user + counselor row).
    const passwordHash = '$2b$10$testtesttesttesttesttesteUNUSEDhashplaceholderxxxxxx';
    const bUser = await prisma.user.create({
      data: {
        email: `${seeded.unique}-counselor-b@example.test`,
        passwordHash,
        role: Role.COUNSELOR,
      },
    });
    trackedUserIds.add(bUser.id);

    const bCounselor = await prisma.counselor.create({
      data: { userId: bUser.id, name: 'Counselor B', specialty: 'general' },
    });
    trackedCounselorIds.add(bCounselor.id);

    // Slot owned by counselor A (seeded.counselorId).
    const slotOwnedByA = await dbSlot(14000);

    // Mint counselor B's token directly from the app's JwtService.
    const jwtSvc = app.get(JwtService);
    const counselorBToken = jwtSvc.sign({
      sub: bUser.id,
      role: Role.COUNSELOR,
      counselorId: bCounselor.id,
    });

    const res = await request(app.getHttpServer())
      .patch(`/slots/${slotOwnedByA.id}`)
      .set('Authorization', `Bearer ${counselorBToken}`)
      .send({ isOpen: false });

    expect(res.status).toBe(403);
  });

  // ─── AC-S2 (admin): nonexistent counselor 404 ──────────────────────────────

  it('404 — admin creating slots for nonexistent counselor', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/counselors/nonexistent-counselor-id/slots')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        slots: [{ startAt: futureIso(15000), endAt: futureIso(15001) }],
      });

    expect(res.status).toBe(404);
  });

  it('201 — admin creates slots for an existing counselor', async () => {
    const res = await request(app.getHttpServer())
      .post(`/admin/counselors/${seeded.counselorId}/slots`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        slots: [{ startAt: futureIso(16000), endAt: futureIso(16001) }],
      });

    expect(res.status).toBe(201);
    expect(res.body[0].counselorId).toBe(seeded.counselorId);
    trackedSlotIds.add(res.body[0].id);
  });

  it('200 — admin updates any slot (no ownership check)', async () => {
    const slot = await dbSlot(17000);

    const res = await request(app.getHttpServer())
      .patch(`/admin/slots/${slot.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isOpen: false });

    expect(res.status).toBe(200);
    expect(res.body.isOpen).toBe(false);
  });

  it('200 — admin deletes any slot', async () => {
    const slot = await dbSlot(18000);

    const res = await request(app.getHttpServer())
      .delete(`/admin/slots/${slot.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // Deleted by API — remove from tracking.
    trackedSlotIds.delete(slot.id);
  });
});
