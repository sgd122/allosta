import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Role, SubjectType } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { JwtPayload } from '../../src/common/interfaces/jwt-payload.interface';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Boots a full Nest application from AppModule with the SAME global
 * ValidationPipe configuration as src/main.ts so HTTP-level validation behaves
 * identically to production. Each spec creates its own app + isolated data.
 */
export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  jwt: JwtService;
  /**
   * Mints a JWT for ad-hoc users using the app's own JwtService — same secret
   * and signing config the running server uses — so tests can authenticate
   * without going through the login HTTP endpoint.
   */
  signToken: (payload: JwtPayload) => string;
}

export async function bootTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();

  // Mirror src/main.ts global pipe exactly (whitelist + transform).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.init();

  const prisma = app.get(PrismaService);
  const jwt = app.get(JwtService);

  const signToken = (payload: JwtPayload): string => jwt.sign(payload);

  return { app, prisma, jwt, signToken };
}

/**
 * Identifiers + tokens produced by seedIsolated(). Everything is uniquely
 * suffixed so reruns never collide on @unique email columns.
 */
export interface SeededData {
  unique: string;
  // Counselor (+ user)
  counselorUserId: string;
  counselorId: string;
  counselorToken: string;
  // Customer (+ user)
  customerUserId: string;
  customerId: string;
  customerToken: string;
  // Subjects / catalogue
  productIds: string[];
  testResultId: string;
  testResultMetricKey: string;
  /** An island-local Challenge for enrollment specs (AC4/AC8). */
  challengeId: string;
  // Availability
  slotIds: string[];
}

export interface SeedOptions {
  /** Number of AvailabilitySlots to create (all in the future, isOpen). */
  slotCount?: number;
}

function uniqueTag(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Creates a fully self-contained graph: Counselor(+user), Customer(+user),
 * Products, a TestResult for the customer, and N future AvailabilitySlots.
 * All emails/ids are uniquely suffixed. Returns ids + signed tokens so a spec
 * can act as the seeded customer/counselor immediately.
 *
 * Never touches prisma/seed.ts demo rows — each spec owns its own data island.
 */
export async function seedIsolated(
  prisma: PrismaService,
  signToken: (payload: JwtPayload) => string,
  options: SeedOptions = {},
): Promise<SeededData> {
  const slotCount = options.slotCount ?? 1;
  const unique = uniqueTag();
  const passwordHash = '$2b$10$testtesttesttesttesttesteUNUSEDhashplaceholderxxxxxx';

  // --- Counselor ---
  const counselorUser = await prisma.user.create({
    data: {
      email: `${unique}-counselor@example.test`,
      passwordHash,
      role: Role.COUNSELOR,
    },
  });
  const counselor = await prisma.counselor.create({
    data: {
      userId: counselorUser.id,
      name: `Counselor ${unique}`,
      specialty: 'general',
    },
  });

  // --- Customer ---
  const customerUser = await prisma.user.create({
    data: {
      email: `${unique}-customer@example.test`,
      passwordHash,
      role: Role.CUSTOMER,
    },
  });
  const customer = await prisma.customer.create({
    data: {
      userId: customerUser.id,
      name: `Customer ${unique}`,
      phone: '010-0000-0000',
    },
  });

  // --- Products ---
  const productA = await prisma.product.create({
    data: { name: `Product A ${unique}`, category: 'supplement' },
  });
  const productB = await prisma.product.create({
    data: { name: `Product B ${unique}`, category: 'program' },
  });

  // --- TestResult for the customer subject ---
  const testResultMetricKey = 'focus_index';
  const testResult = await prisma.testResult.create({
    data: {
      subjectType: SubjectType.CUSTOMER,
      subjectId: customer.id,
      serviceType: 'attention',
      metrics: { [testResultMetricKey]: 72, stress: 40 },
    },
  });

  // --- Island-local Challenge (catalog row for enrollment specs) ---
  const challenge = await prisma.challenge.create({
    data: {
      name: `Challenge ${unique}`,
      category: 'program',
      description: `Test challenge ${unique}`,
      linkedServiceType: 'attention',
    },
  });

  // --- Future, open availability slots ---
  const slotIds: string[] = [];
  for (let i = 0; i < slotCount; i += 1) {
    const startAt = new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000);
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
    const slot = await prisma.availabilitySlot.create({
      data: {
        counselorId: counselor.id,
        startAt,
        endAt,
        isOpen: true,
      },
    });
    slotIds.push(slot.id);
  }

  const counselorToken = signToken({
    sub: counselorUser.id,
    role: Role.COUNSELOR,
    counselorId: counselor.id,
  });
  const customerToken = signToken({
    sub: customerUser.id,
    role: Role.CUSTOMER,
    customerId: customer.id,
  });

  return {
    unique,
    counselorUserId: counselorUser.id,
    counselorId: counselor.id,
    counselorToken,
    customerUserId: customerUser.id,
    customerId: customer.id,
    customerToken,
    productIds: [productA.id, productB.id],
    testResultId: testResult.id,
    testResultMetricKey,
    challengeId: challenge.id,
    slotIds,
  };
}

/**
 * Deletes everything seedIsolated() created for the given customer + counselor,
 * in FK-safe order. Cascades handle child rows (bookings, records, joins,
 * notifications), but we also delete shared rows (Product, TestResult) that have
 * no cascading parent. Safe to call in afterAll.
 */
export async function cleanupSeeded(
  prisma: PrismaService,
  seeded: SeededData,
): Promise<void> {
  // Notifications can reference bookings with onDelete: SetNull, so they would
  // otherwise linger — clear the ones tied to this island first.
  const bookings = await prisma.booking.findMany({
    where: { customerId: seeded.customerId },
    select: { id: true },
  });
  const bookingIds = bookings.map((b) => b.id);

  if (bookingIds.length) {
    await prisma.notification.deleteMany({
      where: { bookingId: { in: bookingIds } },
    });
  }

  // Deleting the Customer cascades Booking, FamilyLink (inviter/invitee),
  // ConsultationRecord (via booking), and their join rows.
  await prisma.customer.deleteMany({ where: { id: seeded.customerId } });
  await prisma.user.deleteMany({ where: { id: seeded.customerUserId } });

  // Deleting the Counselor cascades AvailabilitySlot and ConsultationRecord.
  await prisma.counselor.deleteMany({ where: { id: seeded.counselorId } });
  await prisma.user.deleteMany({ where: { id: seeded.counselorUserId } });

  // Standalone rows without a cascading parent. ChallengeEnrollment rows are
  // already swept by the Customer/Counselor cascades above; the Challenge
  // CATALOG row has no cascading parent, so delete it explicitly here.
  await prisma.testResult.deleteMany({ where: { id: seeded.testResultId } });
  await prisma.product.deleteMany({ where: { id: { in: seeded.productIds } } });
  await prisma.challenge.deleteMany({ where: { id: seeded.challengeId } });
}
