import { INestApplication } from '@nestjs/common';
import { FamilyLinkStatus, Role, SubjectType } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  bootTestApp,
  cleanupSeeded,
  seedIsolated,
  SeededData,
} from './helpers/test-app';

/**
 * Family consultation consent — enforced at the BOOKING layer (pain point g).
 *
 * rbac.spec.ts already proves a STRANGER's subject is rejected (403), and
 * family.spec.ts proves REVOKE cuts test-result VISIBILITY. This spec closes the
 * remaining gap: that booking authorization for a family member's subject is
 * gated on an ACCEPTED link, and that withdrawing consent (REVOKE) immediately
 * blocks the booking path too — not just the read path.
 *
 *  - With an ACCEPTED A↔B link, A CAN book against B's test result (subject
 *    derived to B, ownership re-check passes) → 201.
 *  - After the link is REVOKED, the same booking attempt → 403. A PENDING or
 *    REVOKED link never grants booking access; only ACCEPTED does.
 */
describe('Family consent at the booking layer (pain point g)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Customer A — inviter island (has counselor + 2 future slots + A testResult).
  let islandA: SeededData;
  // Customer B — independent customer whose test result A will book against.
  let customerBId: string;
  let customerBUserId: string;
  let customerBTestResultId: string;
  // The A↔B link row, flipped ACCEPTED → REVOKED across the two tests.
  let linkId: string;

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;

    islandA = await seedIsolated(prisma, ctx.signToken, { slotCount: 2 });

    const pwHash = '$2b$10$testtesttesttesttesttesteUNUSEDhashplaceholderxxxxxx';
    const userB = await prisma.user.create({
      data: {
        email: `consent-b-${islandA.unique}@example.test`,
        passwordHash: pwHash,
        role: Role.CUSTOMER,
      },
    });
    const customerB = await prisma.customer.create({
      data: {
        userId: userB.id,
        name: `Consent B ${islandA.unique}`,
        phone: '010-4444-5555',
      },
    });
    customerBId = customerB.id;
    customerBUserId = userB.id;

    const testResultB = await prisma.testResult.create({
      data: {
        subjectType: SubjectType.CUSTOMER,
        subjectId: customerB.id,
        serviceType: 'attention',
        metrics: { focus_index: 61, stress: 48 },
      },
    });
    customerBTestResultId = testResultB.id;

    // A↔B link, seeded directly as ACCEPTED (mirrors the normalized pair the
    // accept flow writes — see family.spec.ts AC10 setup).
    const [low, high] = [islandA.customerId, customerBId].sort() as [
      string,
      string,
    ];
    const link = await prisma.familyLink.create({
      data: {
        inviterCustomerId: islandA.customerId,
        inviteeCustomerId: customerBId,
        customerLowId: low,
        customerHighId: high,
        code: `consent-ab-${islandA.unique}`,
        status: FamilyLinkStatus.ACCEPTED,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        acceptedAt: new Date(),
      },
    });
    linkId = link.id;
  });

  afterAll(async () => {
    await prisma.familyLink.deleteMany({ where: { id: linkId } });
    await prisma.testResult.deleteMany({ where: { id: customerBTestResultId } });
    await prisma.customer.deleteMany({ where: { id: customerBId } });
    await prisma.user.deleteMany({ where: { id: customerBUserId } });
    await cleanupSeeded(prisma, islandA);
    await app.close();
  });

  it('ACCEPTED link: A can book against family member B test result → 201', async () => {
    const res = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${islandA.customerToken}`)
      .send({
        slotId: islandA.slotIds[0],
        testResultId: customerBTestResultId,
      });

    expect(res.status).toBe(201);
    // Subject is server-derived from the test result — it is B, not A.
    expect(res.body.subjectType).toBe(SubjectType.CUSTOMER);
    expect(res.body.subjectId).toBe(customerBId);
  });

  it('after REVOKE, the same booking attempt is rejected → 403 (consent withdrawn)', async () => {
    // Withdraw consent: the booking path must honor it immediately, like the
    // read path does (family.spec.ts AC8 visibility).
    await prisma.familyLink.update({
      where: { id: linkId },
      data: { status: FamilyLinkStatus.REVOKED },
    });

    const res = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${islandA.customerToken}`)
      .send({
        slotId: islandA.slotIds[1],
        testResultId: customerBTestResultId,
      });

    expect(res.status).toBe(403);
  });
});
