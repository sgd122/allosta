import { INestApplication } from '@nestjs/common';
import { SubjectType } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  bootTestApp,
  cleanupSeeded,
  seedIsolated,
  SeededData,
} from './helpers/test-app';

/**
 * Customer test-result metrics are returned in their RAW stored shape — the
 * extended fields (referenceRange, status) survive the GET /test-results
 * response and are NOT stripped to a {metricKey, value, unit} projection.
 */
describe('Customer test-result metrics (raw shape preserved)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let island: SeededData;
  let extendedTestResultId: string;

  // The extended-array metric whose referenceRange/status must survive the API.
  const extendedMetric = {
    metricKey: 'glucose',
    label: '공복혈당',
    value: 102,
    unit: 'mg/dL',
    referenceRange: '70–99',
    status: '주의',
  };

  beforeAll(async () => {
    const ctx = await bootTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    island = await seedIsolated(prisma, ctx.signToken, { slotCount: 1 });

    const created = await prisma.testResult.create({
      data: {
        subjectType: SubjectType.CUSTOMER,
        subjectId: island.customerId,
        serviceType: 'metabolic',
        metrics: [extendedMetric],
      },
    });
    extendedTestResultId = created.id;
  });

  afterAll(async () => {
    // Delete the extra TestResult before the island teardown (it has no
    // cascading parent, like the seeded TestResult cleanupSeeded handles).
    await prisma.testResult.deleteMany({ where: { id: extendedTestResultId } });
    await cleanupSeeded(prisma, island);
    await app.close();
  });

  it('preserves referenceRange and status on returned metrics for the owning customer', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-results')
      .set('Authorization', `Bearer ${island.customerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const result = (res.body as { id: string; metrics: unknown }[]).find(
      (r) => r.id === extendedTestResultId,
    );
    expect(result).toBeDefined();

    const metrics = result!.metrics as Array<Record<string, unknown>>;
    expect(Array.isArray(metrics)).toBe(true);

    const glucose = metrics.find((m) => m.metricKey === 'glucose');
    expect(glucose).toBeDefined();
    // RAW shape — extended fields are NOT stripped.
    expect(glucose!.referenceRange).toBe('70–99');
    expect(glucose!.status).toBe('주의');
    expect(glucose!.label).toBe('공복혈당');
    expect(glucose!.value).toBe(102);
    expect(glucose!.unit).toBe('mg/dL');
  });
});
