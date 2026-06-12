import { BookingStatus, SubjectType } from "@prisma/client";
import {
  SeededData,
  bootTestApp,
  cleanupSeeded,
  seedIsolated,
} from "./helpers/test-app";

import { INestApplication } from "@nestjs/common";
import { PrismaService } from "../src/prisma/prisma.service";
import request from "supertest";

/**
 * Brief open-rate analytics (AC-P7).
 *
 * Denominator = bookings with status IN (CONFIRMED, COMPLETED, NO_SHOW);
 * numerator = those with briefOpenedAt != null. Deterministic aggregate, scoped
 * own/all like the rest of the dashboard. (ADR 0014 removed the post-
 * consultation AI-summary aux metrics; only briefOpenRate remains here.)
 *
 * Island A (counselorA):
 *   - bA1 CONFIRMED, briefOpenedAt set        (counts num + denom)
 *   - bA2 COMPLETED, briefOpenedAt set        (counts num + denom)
 *   - bA3 NO_SHOW,   briefOpenedAt null       (counts denom only)
 *   - bA4 PENDING,   briefOpenedAt set        (excluded from denom entirely)
 *   - bA5 CANCELLED, briefOpenedAt set        (excluded from denom entirely)
 *   Expected briefOpenRate = 2 / 3.
 *
 * Island B (counselorB):
 *   - bB1 CONFIRMED, briefOpenedAt null       (denom only)
 *   Expected briefOpenRate = 0.
 */
describe("Analytics brief-open-rate (AC-P7)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let islandA: SeededData;
  let islandB: SeededData;

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    islandA = await seedIsolated(prisma, ctx.signToken, { slotCount: 5 });
    islandB = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });

    const opened = new Date();

    const mk = async (
      island: SeededData,
      slotId: string,
      status: BookingStatus,
      briefOpenedAt: Date | null,
    ): Promise<string> => {
      // Mirror the denormalized slot window the service sets (ADR 0015).
      const slot = await prisma.availabilitySlot.findUniqueOrThrow({
        where: { id: slotId },
        select: { startAt: true, endAt: true },
      });
      const b = await prisma.booking.create({
        data: {
          slotId,
          customerId: island.customerId,
          subjectType: SubjectType.CUSTOMER,
          subjectId: island.customerId,
          status,
          briefOpenedAt,
          slotStartAt: slot.startAt,
          slotEndAt: slot.endAt,
        },
      });
      return b.id;
    };

    // ── Island A bookings ────────────────────────────────────────────────
    await mk(islandA, islandA.slotIds[0], BookingStatus.CONFIRMED, opened); // num+denom
    await mk(islandA, islandA.slotIds[1], BookingStatus.COMPLETED, opened); // num+denom
    await mk(islandA, islandA.slotIds[2], BookingStatus.NO_SHOW, null); // denom only
    await mk(islandA, islandA.slotIds[3], BookingStatus.PENDING, opened); // excluded
    await mk(islandA, islandA.slotIds[4], BookingStatus.CANCELLED, opened); // excluded

    // ── Island B: one CONFIRMED, brief never opened ──────────────────────
    await mk(islandB, islandB.slotIds[0], BookingStatus.CONFIRMED, null);
  });

  afterAll(async () => {
    await cleanupSeeded(prisma, islandA);
    await cleanupSeeded(prisma, islandB);
    await app.close();
  });

  it("briefOpenRate (scope=own) = 2/3 for counselorA — denom IN (CONFIRMED,COMPLETED,NO_SHOW)", async () => {
    const res = await request(app.getHttpServer())
      .get("/admin/analytics")
      .set("Authorization", `Bearer ${islandA.counselorToken}`);

    expect(res.status).toBe(200);
    // bA1 CONFIRMED + bA2 COMPLETED + bA3 NO_SHOW in denom; PENDING + CANCELLED
    // excluded. Numerator = bA1 + bA2 opened = 2. Denominator = 3.
    expect((res.body as { briefOpenRate: number }).briefOpenRate).toBeCloseTo(
      2 / 3,
    );
  });

  it("scope isolation: counselorB sees briefOpenRate 0", async () => {
    const res = await request(app.getHttpServer())
      .get("/admin/analytics")
      .set("Authorization", `Bearer ${islandB.counselorToken}`);

    expect(res.status).toBe(200);
    // 0 opened / 1 (CONFIRMED) denominator = 0; A's data must not bleed in.
    expect((res.body as { briefOpenRate: number }).briefOpenRate).toBe(0);
  });

  it("briefOpenRate is a finite number (zero-denominator guard)", async () => {
    const res = await request(app.getHttpServer())
      .get("/admin/analytics")
      .set("Authorization", `Bearer ${islandB.counselorToken}`);

    expect(res.status).toBe(200);
    const body = res.body as { briefOpenRate: unknown };
    expect(typeof body.briefOpenRate).toBe("number");
    expect(Number.isFinite(body.briefOpenRate as number)).toBe(true);
  });
});
