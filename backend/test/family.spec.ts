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
 * AC1–AC10: Symmetric family invite-code flow (Customer↔Customer).
 *
 * Covers:
 *  - AC3/AC6: Any Customer generates their own invite code; active PENDING code
 *    is reused on subsequent calls.
 *  - AC5: Self-accept → 400.
 *  - AC4: Already-accepted / REVOKED codes → distinct 4xx.
 *  - AC1: Duplicate-pair accept → second returns 409.
 *  - AC2: Bidirectional GET /test-results visibility after ACCEPTED link.
 *  - AC7/AC8: Revoke by either party; re-link after revoke succeeds.
 *  - AC8 visibility: After REVOKE, cross-link test-result access is cut.
 *  - Bidirectional listLinks for both A and B.
 *  - RBAC: 401/403 for missing / wrong-role tokens.
 *  - AC10: 1-hop non-transitivity (separate describe block).
 */
describe('Family symmetric invite-code flow (AC1–AC10)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Customer A — the inviter island (has counselor + slots + testResult).
  let islandA: SeededData;
  // Customer B — independent customer who accepts A's code.
  let customerBId: string;
  let customerBToken: string;
  let customerBUserId: string;
  let customerBTestResultId: string;

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;

    islandA = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });

    // Create Customer B with a separate User + Customer profile.
    const userB = await prisma.user.create({
      data: {
        email: `family-b-${islandA.unique}@example.test`,
        passwordHash: '$2b$10$testtesttesttesttesttesteUNUSEDhashplaceholderxxxxxx',
        role: Role.CUSTOMER,
      },
    });
    const customerB = await prisma.customer.create({
      data: {
        userId: userB.id,
        name: `Customer B ${islandA.unique}`,
        phone: '010-1111-2222',
      },
    });
    customerBId = customerB.id;
    customerBUserId = userB.id;
    customerBToken = ctx.signToken({
      sub: userB.id,
      role: Role.CUSTOMER,
      customerId: customerB.id,
    });

    // Create a test result for Customer B (needed for AC2 bidirectional visibility).
    const testResultB = await prisma.testResult.create({
      data: {
        subjectType: SubjectType.CUSTOMER,
        subjectId: customerB.id,
        serviceType: 'attention',
        metrics: { focus_index: 58, stress: 55 },
      },
    });
    customerBTestResultId = testResultB.id;
  });

  afterAll(async () => {
    // Remove all FamilyLinks for this island before customer deletion.
    await prisma.familyLink.deleteMany({
      where: {
        OR: [
          { inviterCustomerId: customerBId },
          { inviteeCustomerId: customerBId },
          { inviterCustomerId: islandA.customerId },
          { inviteeCustomerId: islandA.customerId },
        ],
      },
    });
    // TestResult has no cascading parent — delete explicitly.
    await prisma.testResult.deleteMany({ where: { id: customerBTestResultId } });
    await prisma.customer.deleteMany({ where: { id: customerBId } });
    await prisma.user.deleteMany({ where: { id: customerBUserId } });
    await cleanupSeeded(prisma, islandA);
    await app.close();
  });

  // ── Invite code generation (AC3, AC6) ───────────────────────────────────

  it('AC3: Customer A generates an invite code (no body required)', async () => {
    const res = await request(app.getHttpServer())
      .post('/family/invite-codes')
      .set('Authorization', `Bearer ${islandA.customerToken}`);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      inviterCustomerId: islandA.customerId,
      status: 'PENDING',
    });
    expect(typeof res.body.code).toBe('string');
    expect(res.body.code.length).toBeGreaterThan(10);
  });

  it('AC6: second generate call returns same active PENDING code', async () => {
    const first = await request(app.getHttpServer())
      .post('/family/invite-codes')
      .set('Authorization', `Bearer ${islandA.customerToken}`);
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post('/family/invite-codes')
      .set('Authorization', `Bearer ${islandA.customerToken}`);
    expect(second.status).toBe(201);

    expect(second.body.id).toBe(first.body.id);
    expect(second.body.code).toBe(first.body.code);
  });

  // ── Self-accept guard (AC5) ──────────────────────────────────────────────

  it('AC5: inviter cannot accept their own code → 400', async () => {
    const genRes = await request(app.getHttpServer())
      .post('/family/invite-codes')
      .set('Authorization', `Bearer ${islandA.customerToken}`);
    expect(genRes.status).toBe(201);
    const code: string = genRes.body.code as string;

    const res = await request(app.getHttpServer())
      .post(`/family/invite-codes/${code}/accept`)
      .set('Authorization', `Bearer ${islandA.customerToken}`);

    expect(res.status).toBe(400);
  });

  // ── Full accept flow ─────────────────────────────────────────────────────

  it('Customer B accepts Customer A invite code → ACCEPTED with normalized pair', async () => {
    const genRes = await request(app.getHttpServer())
      .post('/family/invite-codes')
      .set('Authorization', `Bearer ${islandA.customerToken}`);
    expect(genRes.status).toBe(201);
    const code: string = genRes.body.code as string;

    const acceptRes = await request(app.getHttpServer())
      .post(`/family/invite-codes/${code}/accept`)
      .set('Authorization', `Bearer ${customerBToken}`);

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.status).toBe('ACCEPTED');
    expect(acceptRes.body.acceptedAt).toBeTruthy();
    expect(acceptRes.body.inviteeCustomerId).toBe(customerBId);
    // Normalized pair must be set.
    const ids = [islandA.customerId, customerBId].sort();
    expect(acceptRes.body.customerLowId).toBe(ids[0]);
    expect(acceptRes.body.customerHighId).toBe(ids[1]);
  });

  // ── AC2: Bidirectional test-result visibility after ACCEPTED link ────────

  it('AC2: after ACCEPTED link, A sees B test results via GET /test-results', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-results')
      .set('Authorization', `Bearer ${islandA.customerToken}`);

    expect(res.status).toBe(200);
    const resultIds = (res.body as Array<{ id: string }>).map((r) => r.id);
    expect(resultIds).toContain(customerBTestResultId);
    expect(resultIds).toContain(islandA.testResultId);
  });

  it('AC2: after ACCEPTED link, B sees A test results via GET /test-results', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-results')
      .set('Authorization', `Bearer ${customerBToken}`);

    expect(res.status).toBe(200);
    const resultIds = (res.body as Array<{ id: string }>).map((r) => r.id);
    expect(resultIds).toContain(islandA.testResultId);
    expect(resultIds).toContain(customerBTestResultId);
  });

  // ── Already-accepted code (AC4) ─────────────────────────────────────────

  it('AC4: already-accepted code → 400 on second accept attempt', async () => {
    const link = await prisma.familyLink.findFirst({
      where: { inviterCustomerId: islandA.customerId, status: 'ACCEPTED' },
    });
    expect(link).toBeTruthy();

    const res = await request(app.getHttpServer())
      .post(`/family/invite-codes/${link!.code}/accept`)
      .set('Authorization', `Bearer ${customerBToken}`);

    expect(res.status).toBe(400);
  });

  // ── Duplicate pair (AC1) — second ACCEPTED link for same pair → 409 ─────

  it('AC1: accepting a second code for the same pair → 409', async () => {
    // B generates a new code; A tries to accept — pair already ACCEPTED.
    const genRes = await request(app.getHttpServer())
      .post('/family/invite-codes')
      .set('Authorization', `Bearer ${customerBToken}`);
    expect(genRes.status).toBe(201);

    // Fetch the code directly from the DB to avoid any JSON-serialisation
    // edge-case where genRes.body.code resolves to `undefined` at runtime
    // (TypeScript `as string` casts are compile-time only).
    const bPending = await prisma.familyLink.findFirst({
      where: { inviterCustomerId: customerBId, status: FamilyLinkStatus.PENDING },
      orderBy: { createdAt: 'desc' },
    });
    expect(bPending).toBeTruthy();

    const acceptRes = await request(app.getHttpServer())
      .post(`/family/invite-codes/${bPending!.code}/accept`)
      .set('Authorization', `Bearer ${islandA.customerToken}`);

    expect(acceptRes.status).toBe(409);
  });

  // ── List links (bidirectional) ───────────────────────────────────────────

  it('Customer A sees ACCEPTED link with counterpart = Customer B', async () => {
    const res = await request(app.getHttpServer())
      .get('/family/links')
      .set('Authorization', `Bearer ${islandA.customerToken}`);

    expect(res.status).toBe(200);
    const accepted = (
      res.body as Array<{ status: string; counterpart: { id: string; name: string } }>
    ).filter((l) => l.status === 'ACCEPTED');
    expect(accepted.length).toBeGreaterThan(0);
    expect(accepted[0].counterpart.id).toBe(customerBId);
    expect(typeof accepted[0].counterpart.name).toBe('string');
  });

  it('Customer B also sees the ACCEPTED link with counterpart = Customer A', async () => {
    const res = await request(app.getHttpServer())
      .get('/family/links')
      .set('Authorization', `Bearer ${customerBToken}`);

    expect(res.status).toBe(200);
    const accepted = (
      res.body as Array<{ status: string; counterpart: { id: string } }>
    ).filter((l) => l.status === 'ACCEPTED');
    expect(accepted.length).toBeGreaterThan(0);
    expect(accepted[0].counterpart.id).toBe(islandA.customerId);
  });

  // ── Revoke (AC7, AC8) ────────────────────────────────────────────────────

  it('AC8: Customer B (invitee) can revoke the link', async () => {
    const link = await prisma.familyLink.findFirst({
      where: {
        OR: [
          { inviterCustomerId: islandA.customerId, inviteeCustomerId: customerBId },
          { inviterCustomerId: customerBId, inviteeCustomerId: islandA.customerId },
        ],
        status: 'ACCEPTED',
      },
    });
    expect(link).toBeTruthy();

    const res = await request(app.getHttpServer())
      .delete(`/family/links/${link!.id}`)
      .set('Authorization', `Bearer ${customerBToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REVOKED');
  });

  it('AC4: revoking an already-REVOKED link → 400', async () => {
    const link = await prisma.familyLink.findFirst({
      where: {
        OR: [
          { inviterCustomerId: islandA.customerId },
          { inviteeCustomerId: islandA.customerId },
        ],
        status: 'REVOKED',
      },
    });
    expect(link).toBeTruthy();

    const res = await request(app.getHttpServer())
      .delete(`/family/links/${link!.id}`)
      .set('Authorization', `Bearer ${islandA.customerToken}`);

    expect(res.status).toBe(400);
  });

  // ── AC8 visibility: after REVOKE, cross-link test-result access is cut ───

  it('AC8 visibility: after REVOKE, A no longer sees B test results in GET /test-results', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-results')
      .set('Authorization', `Bearer ${islandA.customerToken}`);

    expect(res.status).toBe(200);
    const resultIds = (res.body as Array<{ id: string }>).map((r) => r.id);
    expect(resultIds).not.toContain(customerBTestResultId);
    expect(resultIds).toContain(islandA.testResultId);
  });

  it('AC8 visibility: after REVOKE, B no longer sees A test results in GET /test-results', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-results')
      .set('Authorization', `Bearer ${customerBToken}`);

    expect(res.status).toBe(200);
    const resultIds = (res.body as Array<{ id: string }>).map((r) => r.id);
    expect(resultIds).not.toContain(islandA.testResultId);
    expect(resultIds).toContain(customerBTestResultId);
  });

  // ── Re-link after revoke (AC7) ───────────────────────────────────────────

  it('AC7: after REVOKE, new code can re-link the same pair', async () => {
    const genRes = await request(app.getHttpServer())
      .post('/family/invite-codes')
      .set('Authorization', `Bearer ${islandA.customerToken}`);
    expect(genRes.status).toBe(201);

    const acceptRes = await request(app.getHttpServer())
      .post(`/family/invite-codes/${genRes.body.code as string}/accept`)
      .set('Authorization', `Bearer ${customerBToken}`);

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.status).toBe('ACCEPTED');
  });

  // ── RBAC ─────────────────────────────────────────────────────────────────

  it('returns 401 when no token is provided', async () => {
    const res = await request(app.getHttpServer()).get('/family/links');
    expect(res.status).toBe(401);
  });

  it('returns 403 when COUNSELOR role calls POST /family/invite-codes', async () => {
    const res = await request(app.getHttpServer())
      .post('/family/invite-codes')
      .set('Authorization', `Bearer ${islandA.counselorToken}`);

    expect(res.status).toBe(403);
  });
});

/**
 * AC10: 1-hop non-transitivity.
 *
 * A↔B ACCEPTED + B↔C ACCEPTED ⇏ A can see C's test results.
 * findForCustomer only follows direct ACCEPTED links, not transitive ones.
 */
describe('AC10: 1-hop non-transitivity', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let islandA10: SeededData;
  let customerBId10: string;
  let customerBUserId10: string;
  let customerCId10: string;
  let customerCUserId10: string;
  let customerCTestResultId10: string;

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;

    islandA10 = await seedIsolated(prisma, ctx.signToken, { slotCount: 0 });

    const pwHash = '$2b$10$testtesttesttesttesttesteUNUSEDhashplaceholderxxxxxx';

    // Customer B
    const userB = await prisma.user.create({
      data: {
        email: `ac10-b-${islandA10.unique}@example.test`,
        passwordHash: pwHash,
        role: Role.CUSTOMER,
      },
    });
    const customerB = await prisma.customer.create({
      data: { userId: userB.id, name: `AC10 B ${islandA10.unique}`, phone: '010-2222-3333' },
    });
    customerBId10 = customerB.id;
    customerBUserId10 = userB.id;

    // Customer C
    const userC = await prisma.user.create({
      data: {
        email: `ac10-c-${islandA10.unique}@example.test`,
        passwordHash: pwHash,
        role: Role.CUSTOMER,
      },
    });
    const customerC = await prisma.customer.create({
      data: { userId: userC.id, name: `AC10 C ${islandA10.unique}`, phone: '010-3333-4444' },
    });
    customerCId10 = customerC.id;
    customerCUserId10 = userC.id;

    // Test result for C — A must NOT see this via transitivity.
    const testResultC = await prisma.testResult.create({
      data: {
        subjectType: SubjectType.CUSTOMER,
        subjectId: customerC.id,
        serviceType: 'attention',
        metrics: { focus_index: 65 },
      },
    });
    customerCTestResultId10 = testResultC.id;

    // A↔B: directly ACCEPTED link
    const [abLow, abHigh] = [islandA10.customerId, customerBId10].sort() as [string, string];
    await prisma.familyLink.create({
      data: {
        inviterCustomerId: islandA10.customerId,
        inviteeCustomerId: customerBId10,
        customerLowId: abLow,
        customerHighId: abHigh,
        code: `ac10-ab-${islandA10.unique}`,
        status: FamilyLinkStatus.ACCEPTED,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        acceptedAt: new Date(),
      },
    });

    // B↔C: directly ACCEPTED link (A has no direct link to C)
    const [bcLow, bcHigh] = [customerBId10, customerCId10].sort() as [string, string];
    await prisma.familyLink.create({
      data: {
        inviterCustomerId: customerBId10,
        inviteeCustomerId: customerCId10,
        customerLowId: bcLow,
        customerHighId: bcHigh,
        code: `ac10-bc-${islandA10.unique}`,
        status: FamilyLinkStatus.ACCEPTED,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        acceptedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await prisma.familyLink.deleteMany({
      where: {
        OR: [
          { inviterCustomerId: islandA10.customerId },
          { inviteeCustomerId: islandA10.customerId },
          { inviterCustomerId: customerBId10 },
          { inviteeCustomerId: customerBId10 },
          { inviterCustomerId: customerCId10 },
          { inviteeCustomerId: customerCId10 },
        ],
      },
    });
    await prisma.testResult.deleteMany({ where: { id: customerCTestResultId10 } });
    await prisma.customer.deleteMany({
      where: { id: { in: [customerBId10, customerCId10] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [customerBUserId10, customerCUserId10] } },
    });
    await cleanupSeeded(prisma, islandA10);
    await app.close();
  });

  it('AC10: A cannot see C test results even though B↔C is ACCEPTED (no transitivity)', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-results')
      .set('Authorization', `Bearer ${islandA10.customerToken}`);

    expect(res.status).toBe(200);
    const resultIds = (res.body as Array<{ id: string }>).map((r) => r.id);
    // A sees its own result and B's (via direct A↔B link), but NOT C's.
    expect(resultIds).toContain(islandA10.testResultId);
    expect(resultIds).not.toContain(customerCTestResultId10);
  });
});
