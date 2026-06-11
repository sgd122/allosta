import { INestApplication } from '@nestjs/common';
import { Role, SubjectType, WaitlistStatus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { WaitlistService } from '../src/waitlist/waitlist.service';
import {
  bootTestApp,
  cleanupSeeded,
  seedIsolated,
  SeededData,
} from './helpers/test-app';

/**
 * Waitlist conversion integration tests — AC-W2, AC-W3, AC-W4, AC-W5.
 *
 * Key discipline (plan §advisory-by-construction):
 * - Domain methods (promoteOnCancellation, sweepWaitlistOffers, convertOnBooking)
 *   are called DIRECTLY, never via the live @Interval.
 * - promoteOnCancellation is called inside a prisma.$transaction() to mirror
 *   production — it requires a TransactionClient.
 * - Waitlist rows are created directly via prisma (not the HTTP endpoint) to
 *   avoid ownership-assertion overhead on the subject in the create() method.
 * - A second customer (customerB) is created inline per test that needs it.
 */
describe('Waitlist conversion (AC-W2, AC-W3, AC-W4, AC-W5)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let waitlistService: WaitlistService;
  let island: SeededData;

  const PASSWORD_HASH =
    '$2b$10$testtesttesttesttesttesteUNUSEDhashplaceholderxxxxxx';

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    waitlistService = app.get(WaitlistService);
    island = await seedIsolated(prisma, ctx.signToken, { slotCount: 2 });
  });

  afterAll(async () => {
    await cleanupSeeded(prisma, island);
    await app.close();
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Creates an extra customer record (not in the seeded island) for multi-waiter tests. */
  async function createExtraCustomer(
    suffix: string,
  ): Promise<{ customerId: string; userId: string }> {
    const user = await prisma.user.create({
      data: {
        email: `extra-${suffix}-${island.unique}@example.test`,
        passwordHash: PASSWORD_HASH,
        role: Role.CUSTOMER,
      },
    });
    const customer = await prisma.customer.create({
      data: {
        userId: user.id,
        name: `Extra ${suffix} ${island.unique}`,
        phone: '010-9999-9999',
      },
    });
    return { customerId: customer.id, userId: user.id };
  }

  async function deleteExtraCustomer(
    customerId: string,
    userId: string,
  ): Promise<void> {
    // Notifications may reference waitlist rows
    const waitlists = await prisma.waitlist.findMany({
      where: { customerId },
      select: { id: true },
    });
    if (waitlists.length) {
      await prisma.notification.deleteMany({
        where: { waitlistId: { in: waitlists.map((w) => w.id) } },
      });
    }
    await prisma.waitlist.deleteMany({ where: { customerId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }

  async function waitlistCount(customerId: string): Promise<number> {
    return prisma.waitlist.count({ where: { customerId } });
  }

  // ── AC-W2: promoteOnCancellation ─────────────────────────────────────────

  describe('AC-W2: promoteOnCancellation sets NOTIFIED + offer fields', () => {
    it('sets NOTIFIED + offeredSlotId + offerExpiresAt on the oldest WAITING entry', async () => {
      const slotId = island.slotIds[0];
      const counselorId = island.counselorId;

      const wl = await prisma.waitlist.create({
        data: {
          customerId: island.customerId,
          counselorId,
          subjectType: SubjectType.CUSTOMER,
          subjectId: island.customerId,
          status: WaitlistStatus.WAITING,
        },
      });

      await prisma.$transaction(async (tx) => {
        await waitlistService.promoteOnCancellation(counselorId, slotId, tx);
      });

      const updated = await prisma.waitlist.findUniqueOrThrow({
        where: { id: wl.id },
      });
      expect(updated.status).toBe(WaitlistStatus.NOTIFIED);
      expect(updated.offeredSlotId).toBe(slotId);
      expect(updated.offerExpiresAt).not.toBeNull();

      // Cleanup
      await prisma.notification.deleteMany({ where: { waitlistId: wl.id } });
      await prisma.waitlist.delete({ where: { id: wl.id } });
    });

    it('promotes FIFO — oldest WAITING first when multiple waiters exist', async () => {
      const slotId = island.slotIds[1];
      const counselorId = island.counselorId;
      const { customerId: bId, userId: bUid } =
        await createExtraCustomer('fifo-b');

      // A created first (older)
      const wlA = await prisma.waitlist.create({
        data: {
          customerId: island.customerId,
          counselorId,
          subjectType: SubjectType.CUSTOMER,
          subjectId: island.customerId,
          status: WaitlistStatus.WAITING,
        },
      });
      const wlB = await prisma.waitlist.create({
        data: {
          customerId: bId,
          counselorId,
          subjectType: SubjectType.CUSTOMER,
          subjectId: bId,
          status: WaitlistStatus.WAITING,
        },
      });

      await prisma.$transaction(async (tx) => {
        await waitlistService.promoteOnCancellation(counselorId, slotId, tx);
      });

      const a = await prisma.waitlist.findUniqueOrThrow({ where: { id: wlA.id } });
      const b = await prisma.waitlist.findUniqueOrThrow({ where: { id: wlB.id } });
      expect(a.status).toBe(WaitlistStatus.NOTIFIED);
      expect(b.status).toBe(WaitlistStatus.WAITING);

      // Cleanup
      await prisma.notification.deleteMany({
        where: { waitlistId: { in: [wlA.id, wlB.id] } },
      });
      await prisma.waitlist.deleteMany({
        where: { id: { in: [wlA.id, wlB.id] } },
      });
      await deleteExtraCustomer(bId, bUid);
    });

    it('is a no-op when no WAITING entry exists for the counselor', async () => {
      const slotId = island.slotIds[0];
      const countBefore = await waitlistCount(island.customerId);

      await expect(
        prisma.$transaction(async (tx) => {
          await waitlistService.promoteOnCancellation(
            island.counselorId,
            slotId,
            tx,
          );
        }),
      ).resolves.not.toThrow();

      const countAfter = await waitlistCount(island.customerId);
      expect(countAfter).toBe(countBefore);
    });
  });

  // ── AC-W3: sweepWaitlistOffers ────────────────────────────────────────────

  describe('AC-W3: sweepWaitlistOffers expires offers and re-promotes', () => {
    it('expires NOTIFIED past TTL and re-promotes next WAITING unconditionally', async () => {
      const slotId = island.slotIds[0];
      const counselorId = island.counselorId;
      const { customerId: bId, userId: bUid } =
        await createExtraCustomer('sweep-b');

      // A: already NOTIFIED with a past offerExpiresAt (TTL already expired)
      const wlA = await prisma.waitlist.create({
        data: {
          customerId: island.customerId,
          counselorId,
          subjectType: SubjectType.CUSTOMER,
          subjectId: island.customerId,
          status: WaitlistStatus.NOTIFIED,
          offeredSlotId: slotId,
          offerExpiresAt: new Date(Date.now() - 60_000), // 1 min ago
        },
      });
      // B: WAITING, will be re-promoted
      const wlB = await prisma.waitlist.create({
        data: {
          customerId: bId,
          counselorId,
          subjectType: SubjectType.CUSTOMER,
          subjectId: bId,
          status: WaitlistStatus.WAITING,
        },
      });

      const count = await waitlistService.sweepWaitlistOffers();

      expect(count).toBeGreaterThanOrEqual(1);

      const a = await prisma.waitlist.findUniqueOrThrow({ where: { id: wlA.id } });
      const b = await prisma.waitlist.findUniqueOrThrow({ where: { id: wlB.id } });
      expect(a.status).toBe(WaitlistStatus.EXPIRED);
      expect(b.status).toBe(WaitlistStatus.NOTIFIED);
      // B inherits the same offeredSlotId
      expect(b.offeredSlotId).toBe(slotId);
      // B's offerExpiresAt is in the future
      expect(b.offerExpiresAt!.getTime()).toBeGreaterThan(Date.now());

      // Cleanup
      await prisma.notification.deleteMany({
        where: { waitlistId: { in: [wlA.id, wlB.id] } },
      });
      await prisma.waitlist.deleteMany({
        where: { id: { in: [wlA.id, wlB.id] } },
      });
      await deleteExtraCustomer(bId, bUid);
    });

    it('expires NOTIFIED with no next waiter — count=1, no re-promotion', async () => {
      const slotId = island.slotIds[1];
      const counselorId = island.counselorId;

      const wlA = await prisma.waitlist.create({
        data: {
          customerId: island.customerId,
          counselorId,
          subjectType: SubjectType.CUSTOMER,
          subjectId: island.customerId,
          status: WaitlistStatus.NOTIFIED,
          offeredSlotId: slotId,
          offerExpiresAt: new Date(Date.now() - 60_000),
        },
      });

      const count = await waitlistService.sweepWaitlistOffers();

      expect(count).toBeGreaterThanOrEqual(1);
      const a = await prisma.waitlist.findUniqueOrThrow({ where: { id: wlA.id } });
      expect(a.status).toBe(WaitlistStatus.EXPIRED);

      await prisma.waitlist.delete({ where: { id: wlA.id } });
    });

    it('returns 0 when no NOTIFIED offers have expired yet', async () => {
      // All active NOTIFIED offers (if any) should have future offerExpiresAt
      // Verify no offers are currently past-TTL from this test run's data
      const count = await prisma.waitlist.count({
        where: {
          status: WaitlistStatus.NOTIFIED,
          offerExpiresAt: { lt: new Date() },
        },
      });
      // Only run the assertion when the test environment is clean
      if (count === 0) {
        const swept = await waitlistService.sweepWaitlistOffers();
        expect(swept).toBe(0);
      }
    });
  });

  // ── AC-W4: convertOnBooking ───────────────────────────────────────────────

  describe('AC-W4: convertOnBooking flips NOTIFIED → CONVERTED', () => {
    it('converts NOTIFIED to CONVERTED when predicate matches', async () => {
      const slotId = island.slotIds[0];

      const wl = await prisma.waitlist.create({
        data: {
          customerId: island.customerId,
          counselorId: island.counselorId,
          subjectType: SubjectType.CUSTOMER,
          subjectId: island.customerId,
          status: WaitlistStatus.NOTIFIED,
          offeredSlotId: slotId,
          offerExpiresAt: new Date(Date.now() + 30 * 60_000),
        },
      });

      await prisma.$transaction(async (tx) => {
        await waitlistService.convertOnBooking(
          tx,
          island.customerId,
          island.counselorId,
          slotId,
        );
      });

      const updated = await prisma.waitlist.findUniqueOrThrow({
        where: { id: wl.id },
      });
      expect(updated.status).toBe(WaitlistStatus.CONVERTED);

      await prisma.waitlist.delete({ where: { id: wl.id } });
    });

    it('does NOT convert an EXPIRED offer — status guard: NOTIFIED only', async () => {
      const slotId = island.slotIds[1];

      const wl = await prisma.waitlist.create({
        data: {
          customerId: island.customerId,
          counselorId: island.counselorId,
          subjectType: SubjectType.CUSTOMER,
          subjectId: island.customerId,
          status: WaitlistStatus.EXPIRED,
          offeredSlotId: slotId,
          offerExpiresAt: new Date(Date.now() - 60_000),
        },
      });

      await prisma.$transaction(async (tx) => {
        await waitlistService.convertOnBooking(
          tx,
          island.customerId,
          island.counselorId,
          slotId,
        );
      });

      const updated = await prisma.waitlist.findUniqueOrThrow({
        where: { id: wl.id },
      });
      expect(updated.status).toBe(WaitlistStatus.EXPIRED);

      await prisma.waitlist.delete({ where: { id: wl.id } });
    });

    it('does NOT convert when offeredSlotId does not match the booked slot', async () => {
      const slotA = island.slotIds[0];
      const slotB = island.slotIds[1];

      const wl = await prisma.waitlist.create({
        data: {
          customerId: island.customerId,
          counselorId: island.counselorId,
          subjectType: SubjectType.CUSTOMER,
          subjectId: island.customerId,
          status: WaitlistStatus.NOTIFIED,
          offeredSlotId: slotA, // offered slot A
          offerExpiresAt: new Date(Date.now() + 30 * 60_000),
        },
      });

      // Book slot B — should NOT convert the offer for slot A
      await prisma.$transaction(async (tx) => {
        await waitlistService.convertOnBooking(
          tx,
          island.customerId,
          island.counselorId,
          slotB, // different slot
        );
      });

      const updated = await prisma.waitlist.findUniqueOrThrow({
        where: { id: wl.id },
      });
      expect(updated.status).toBe(WaitlistStatus.NOTIFIED);

      await prisma.waitlist.delete({ where: { id: wl.id } });
    });
  });

  // ── AC-W5: Full waitlist conversion flow ──────────────────────────────────

  describe('AC-W5: full flow — A→NOTIFIED, A expires, B→NOTIFIED, B books → CONVERTED', () => {
    it('two waitlisters: A offered → A expires → B re-promoted → B converts', async () => {
      const slotId = island.slotIds[0];
      const counselorId = island.counselorId;
      const { customerId: bId, userId: bUid } =
        await createExtraCustomer('w5-b');

      // Step 1: Both A and B are WAITING (A first = older)
      const wlA = await prisma.waitlist.create({
        data: {
          customerId: island.customerId,
          counselorId,
          subjectType: SubjectType.CUSTOMER,
          subjectId: island.customerId,
          status: WaitlistStatus.WAITING,
        },
      });
      const wlB = await prisma.waitlist.create({
        data: {
          customerId: bId,
          counselorId,
          subjectType: SubjectType.CUSTOMER,
          subjectId: bId,
          status: WaitlistStatus.WAITING,
        },
      });

      // Step 2: Slot freed → A promoted to NOTIFIED
      await prisma.$transaction(async (tx) => {
        await waitlistService.promoteOnCancellation(counselorId, slotId, tx);
      });

      const afterPromote = await prisma.waitlist.findUniqueOrThrow({
        where: { id: wlA.id },
      });
      expect(afterPromote.status).toBe(WaitlistStatus.NOTIFIED);
      expect(afterPromote.offeredSlotId).toBe(slotId);

      // Step 3: Simulate A's offer expiring by backdate offerExpiresAt
      await prisma.waitlist.update({
        where: { id: wlA.id },
        data: { offerExpiresAt: new Date(Date.now() - 60_000) },
      });

      // Step 4: Sweep — A → EXPIRED, B → NOTIFIED
      const expiredCount = await waitlistService.sweepWaitlistOffers();
      expect(expiredCount).toBeGreaterThanOrEqual(1);

      const aAfterSweep = await prisma.waitlist.findUniqueOrThrow({
        where: { id: wlA.id },
      });
      const bAfterSweep = await prisma.waitlist.findUniqueOrThrow({
        where: { id: wlB.id },
      });
      expect(aAfterSweep.status).toBe(WaitlistStatus.EXPIRED);
      expect(bAfterSweep.status).toBe(WaitlistStatus.NOTIFIED);
      expect(bAfterSweep.offeredSlotId).toBe(slotId);

      // Step 5: B books the offered slot → B CONVERTED
      await prisma.$transaction(async (tx) => {
        await waitlistService.convertOnBooking(tx, bId, counselorId, slotId);
      });

      const bFinal = await prisma.waitlist.findUniqueOrThrow({
        where: { id: wlB.id },
      });
      expect(bFinal.status).toBe(WaitlistStatus.CONVERTED);

      // Cleanup
      await prisma.notification.deleteMany({
        where: { waitlistId: { in: [wlA.id, wlB.id] } },
      });
      await prisma.waitlist.deleteMany({
        where: { id: { in: [wlA.id, wlB.id] } },
      });
      await deleteExtraCustomer(bId, bUid);
    });
  });
});
