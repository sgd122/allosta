import {
  BookingStatus,
  CallOutcome,
  ConsultationActionType,
  FamilyLinkStatus,
  Outcome,
  PrismaClient,
  Role,
  SubjectType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import {
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS_KO,
} from '../src/common/constants/service-types';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'demo1234';

/** Generates a URL-safe random invite code with sufficient entropy (~128 bits). */
function generateCode(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Idempotent seed. Strategy: wipe domain tables in dependency order, then
 * recreate deterministic demo data. Safe to re-run any number of times.
 *
 * Symmetric family model (plan redesign):
 *   - customer@demo.com  (김고객) — role=CUSTOMER, has Customer profile
 *   - family@demo.com    (이가족) — role=CUSTOMER, has Customer profile
 *   - ONE ACCEPTED FamilyLink between the two (symmetric, bidirectional)
 *   - CUSTOMER-only TestResults for each account
 */
async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ---- Reset (children → parents) -----------------------------------------
  await prisma.challengeEnrollment.deleteMany();
  await prisma.challenge.deleteMany();
  await prisma.familyLink.deleteMany();
  await prisma.consultationRecordMetric.deleteMany();
  await prisma.consultationRecordProduct.deleteMany();
  await prisma.consultationRecord.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.callLog.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.availabilitySlot.deleteMany();
  await prisma.testResult.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.counselor.deleteMany();
  await prisma.user.deleteMany();

  // ---- Users + linked Customer profiles ------------------------------------
  const customerUser = await prisma.user.create({
    data: {
      email: 'customer@demo.com',
      passwordHash,
      role: Role.CUSTOMER,
      customer: {
        create: {
          name: '김고객',
          phone: '010-1000-0001',
        },
      },
    },
    include: { customer: true },
  });
  const customer = customerUser.customer!;

  const familyUser = await prisma.user.create({
    data: {
      email: 'family@demo.com',
      passwordHash,
      role: Role.CUSTOMER,
      customer: {
        create: {
          name: '이가족',
          phone: '010-2000-0002',
        },
      },
    },
    include: { customer: true },
  });
  const familyCustomer = familyUser.customer!;

  const counselorUser = await prisma.user.create({
    data: {
      email: 'counselor@demo.com',
      passwordHash,
      role: Role.COUNSELOR,
      counselor: {
        create: {
          name: '이상담',
          specialty: '영양 상담',
        },
      },
    },
    include: { counselor: true },
  });
  const counselor = counselorUser.counselor!;

  // Second counselor — needed for analytics disjoint-scope tests (AC13).
  const counselor2User = await prisma.user.create({
    data: {
      email: 'counselor2@demo.com',
      passwordHash,
      role: Role.COUNSELOR,
      counselor: {
        create: {
          name: '박상담',
          specialty: '운동 상담',
        },
      },
    },
    include: { counselor: true },
  });
  const counselor2 = counselor2User.counselor!;

  await prisma.user.create({
    data: {
      email: 'admin@demo.com',
      passwordHash,
      role: Role.ADMIN,
    },
  });

  // ---- Symmetric ACCEPTED FamilyLink ---------------------------------------
  const now = new Date();
  const linkCode = generateCode();

  // Normalize sorted pair (AC1 partial unique index requirement).
  const lowId = customer.id < familyCustomer.id ? customer.id : familyCustomer.id;
  const highId = customer.id < familyCustomer.id ? familyCustomer.id : customer.id;
  const isCustomerLow = customer.id === lowId;

  // "what partner is to me": Low→High label / High→Low label
  const relationLowToHigh = isCustomerLow ? '보호자' : '가족';
  const relationHighToLow = isCustomerLow ? '가족' : '보호자';

  await prisma.familyLink.create({
    data: {
      inviterCustomerId: customer.id,
      inviteeCustomerId: familyCustomer.id,
      customerLowId: lowId,
      customerHighId: highId,
      relationLowToHigh,
      relationHighToLow,
      code: linkCode,
      status: FamilyLinkStatus.ACCEPTED,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60_000), // 30 days
      acceptedAt: now,
    },
  });

  // ---- Products (BioCom supplement lines) ---------------------------------
  await prisma.product.createMany({
    data: [
      { name: '메타밸런스 대사케어', category: '대사' },
      { name: '슬립리커버 수면지원', category: '수면' },
      { name: '더마글로우 피부영양', category: '피부' },
      { name: '글루코세이프 혈당관리', category: '혈당' },
      { name: '거트바이옴 장건강', category: '장건강' },
      { name: '오메가케어 혈행개선', category: '혈행' },
    ],
  });
  const products = await prisma.product.findMany({ select: { id: true } });

  // ---- Availability slots -------------------------------------------------
  const nowMs = Date.now();
  const minutes = (m: number): Date => new Date(nowMs + m * 60_000);

  // Near-future slot (~2 min ahead) for deterministic reminder demo.
  await prisma.availabilitySlot.create({
    data: {
      counselorId: counselor.id,
      startAt: minutes(2),
      endAt: minutes(32),
      isOpen: true,
    },
  });

  // Weekday business-hours grid: 2026-06 ~ 2026-08, Mon–Fri, hourly 09:00–18:00
  const GRID_COUNSELOR_IDS = [counselor.id, counselor2.id];
  const GRID_START_HOUR = 9;
  const GRID_END_HOUR = 18;
  const gridStart = new Date(2026, 5, 1); // 2026-06-01
  const gridEnd = new Date(2026, 8, 1);   // 2026-09-01 (exclusive)

  const gridSlots: {
    counselorId: string;
    startAt: Date;
    endAt: Date;
    isOpen: boolean;
  }[] = [];

  for (
    const cursor = new Date(gridStart);
    cursor < gridEnd;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const weekday = cursor.getDay();
    if (weekday === 0 || weekday === 6) continue;

    for (let hour = GRID_START_HOUR; hour < GRID_END_HOUR; hour += 1) {
      const startAt = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate(),
        hour,
        0,
        0,
        0,
      );
      if (startAt.getTime() <= nowMs) continue;
      const endAt = new Date(startAt.getTime() + 60 * 60_000);

      for (const counselorId of GRID_COUNSELOR_IDS) {
        gridSlots.push({ counselorId, startAt, endAt, isOpen: true });
      }
    }
  }

  await prisma.availabilitySlot.createMany({ data: gridSlots });

  // ---- Test results — BioCom's 7 public analysis services (AC1) -----------
  // Metrics are an array of {metricKey, label, value, unit, referenceRange,
  // status} (status ∈ 정상/주의/위험). This is a backward-compatible SUPERSET of
  // the legacy {metricKey,value,unit} shape (ADR 0007). customer gets 4 types,
  // familyCustomer 3, so all 7 codes appear and the customer's results page is
  // rich. The METABOLIC_6 result is the pinned subject for the demo flow below.
  const metabolicResult = await prisma.testResult.create({
    data: {
      subjectType: SubjectType.CUSTOMER,
      subjectId: customer.id,
      serviceType: SERVICE_TYPES.METABOLIC_6,
      metrics: [
        { metricKey: 'glucose', label: '공복혈당', value: 102, unit: 'mg/dL', referenceRange: '70–99', status: '주의' },
        { metricKey: 'hba1c', label: '당화혈색소', value: 5.4, unit: '%', referenceRange: '4.0–5.6', status: '정상' },
        { metricKey: 'triglycerides', label: '중성지방', value: 182, unit: 'mg/dL', referenceRange: '< 150', status: '주의' },
        { metricKey: 'hdl', label: 'HDL 콜레스테롤', value: 52, unit: 'mg/dL', referenceRange: '> 40', status: '정상' },
        { metricKey: 'ldl', label: 'LDL 콜레스테롤', value: 148, unit: 'mg/dL', referenceRange: '< 130', status: '주의' },
        { metricKey: 'insulin', label: '공복인슐린', value: 9.1, unit: 'µIU/mL', referenceRange: '2.6–24.9', status: '정상' },
      ],
    },
  });

  await prisma.testResult.create({
    data: {
      subjectType: SubjectType.CUSTOMER,
      subjectId: customer.id,
      serviceType: SERVICE_TYPES.STRESS_AGING,
      metrics: [
        { metricKey: 'cortisol', label: '코티솔', value: 21.5, unit: 'µg/dL', referenceRange: '5–23', status: '정상' },
        { metricKey: 'oxidativeStress', label: '산화스트레스', value: 384, unit: 'U.CARR', referenceRange: '< 350', status: '주의' },
        { metricKey: 'telomereIndex', label: '텔로미어 지수', value: 6.2, unit: 'kb', referenceRange: '> 6.5', status: '위험' },
      ],
    },
  });

  await prisma.testResult.create({
    data: {
      subjectType: SubjectType.CUSTOMER,
      subjectId: customer.id,
      serviceType: SERVICE_TYPES.GUT_MICROBIOME,
      metrics: [
        { metricKey: 'diversityIndex', label: '다양성 지수', value: 2.8, unit: 'Shannon', referenceRange: '> 3.0', status: '주의' },
        { metricKey: 'beneficialRatio', label: '유익균 비율', value: 64, unit: '%', referenceRange: '> 60', status: '정상' },
        { metricKey: 'firmicutesBacteroidetes', label: 'F/B 비율', value: 1.9, unit: 'ratio', referenceRange: '0.8–2.0', status: '정상' },
      ],
    },
  });

  await prisma.testResult.create({
    data: {
      subjectType: SubjectType.CUSTOMER,
      subjectId: customer.id,
      serviceType: SERVICE_TYPES.FOOD_INTOLERANCE,
      metrics: [
        { metricKey: 'wheatIgG', label: '밀 IgG', value: 86, unit: 'U/mL', referenceRange: '< 50', status: '위험' },
        { metricKey: 'dairyIgG', label: '유제품 IgG', value: 32, unit: 'U/mL', referenceRange: '< 50', status: '정상' },
        { metricKey: 'eggIgG', label: '계란 IgG', value: 58, unit: 'U/mL', referenceRange: '< 50', status: '주의' },
      ],
    },
  });

  await prisma.testResult.create({
    data: {
      subjectType: SubjectType.CUSTOMER,
      subjectId: familyCustomer.id,
      serviceType: SERVICE_TYPES.HORMONE,
      metrics: [
        { metricKey: 'tsh', label: '갑상선자극호르몬', value: 3.2, unit: 'mIU/L', referenceRange: '0.4–4.0', status: '정상' },
        { metricKey: 'estradiol', label: '에스트라디올', value: 45, unit: 'pg/mL', referenceRange: '30–400', status: '정상' },
        { metricKey: 'cortisolAm', label: '오전 코티솔', value: 24.8, unit: 'µg/dL', referenceRange: '5–23', status: '주의' },
      ],
    },
  });

  await prisma.testResult.create({
    data: {
      subjectType: SubjectType.CUSTOMER,
      subjectId: familyCustomer.id,
      serviceType: SERVICE_TYPES.NUTRIENT_HEAVY_METAL,
      metrics: [
        { metricKey: 'vitaminD', label: '비타민 D', value: 18.5, unit: 'ng/mL', referenceRange: '30–100', status: '위험' },
        { metricKey: 'ferritin', label: '페리틴', value: 42, unit: 'ng/mL', referenceRange: '30–400', status: '정상' },
        { metricKey: 'mercury', label: '수은', value: 4.2, unit: 'µg/L', referenceRange: '< 5.0', status: '정상' },
        { metricKey: 'lead', label: '납', value: 6.1, unit: 'µg/dL', referenceRange: '< 5.0', status: '주의' },
      ],
    },
  });

  await prisma.testResult.create({
    data: {
      subjectType: SubjectType.CUSTOMER,
      subjectId: familyCustomer.id,
      serviceType: SERVICE_TYPES.PET_NUTRITION,
      metrics: [
        { metricKey: 'petOmega3', label: '반려동물 오메가3', value: 3.4, unit: '%', referenceRange: '> 4.0', status: '주의' },
        { metricKey: 'petTaurine', label: '타우린', value: 62, unit: 'nmol/mL', referenceRange: '> 60', status: '정상' },
      ],
    },
  });

  // ---- Challenge catalog (BioCom step-3 관리 프로그램) — AC4 ----------------
  // linkedServiceType is ADVISORY only (sort/hint); the UI offers the full list.
  const [metabolicChallenge] = await Promise.all([
    prisma.challenge.create({
      data: {
        name: '대사 리셋 12주 챌린지',
        category: '대사',
        description: '혈당·지질 지표 개선을 목표로 한 12주 식습관·운동 관리 프로그램.',
        linkedServiceType: SERVICE_TYPES.METABOLIC_6,
      },
    }),
    prisma.challenge.create({
      data: {
        name: '장건강 회복 8주 프로그램',
        category: '장건강',
        description: '장내 미생물 다양성 회복을 위한 식이섬유·프로바이오틱스 관리.',
        linkedServiceType: SERVICE_TYPES.GUT_MICROBIOME,
      },
    }),
    prisma.challenge.create({
      data: {
        name: '스트레스 케어 8주',
        category: '스트레스',
        description: '코티솔·산화스트레스 완화를 위한 수면·이완 루틴 관리.',
        linkedServiceType: SERVICE_TYPES.STRESS_AGING,
      },
    }),
    prisma.challenge.create({
      data: {
        name: '호르몬 밸런스 프로그램',
        category: '호르몬',
        description: '호르몬 균형 회복을 위한 영양·생활습관 코칭.',
        linkedServiceType: SERVICE_TYPES.HORMONE,
      },
    }),
  ]);

  // ---- Demo completed flow → one ChallengeEnrollment (AC5/AC10) ------------
  // A past, closed slot (not in availability) carries a COMPLETED booking +
  // PURCHASED record that enrolls the customer into the 대사 리셋 challenge, so
  // the admin dashboard shows a non-empty challenge enrollment + conversion.
  const demoSlot = await prisma.availabilitySlot.create({
    data: {
      counselorId: counselor.id,
      startAt: minutes(-120),
      endAt: minutes(-90),
      isOpen: false,
    },
  });
  const demoBooking = await prisma.booking.create({
    data: {
      slotId: demoSlot.id,
      customerId: customer.id,
      subjectType: SubjectType.CUSTOMER,
      subjectId: customer.id,
      testResultId: metabolicResult.id,
      status: BookingStatus.COMPLETED,
      // Denormalized slot window for the customer-no-overlap constraint (ADR 0015).
      slotStartAt: demoSlot.startAt,
      slotEndAt: demoSlot.endAt,
    },
  });
  const demoRecord = await prisma.consultationRecord.create({
    data: {
      bookingId: demoBooking.id,
      counselorId: counselor.id,
      summary: '대사 6종 검사 결과 상담 — 공복혈당·중성지방 주의 소견 설명.',
      recommendation: '식이 조절과 대사 리셋 챌린지 참여를 권고.',
      followUp: '4주 후 재검사 권장.',
      actions: [
        ConsultationActionType.METRIC_EXPLAINED,
        ConsultationActionType.DIET_GUIDANCE,
        ConsultationActionType.SUPPLEMENT_GUIDANCE,
      ],
      outcome: Outcome.PURCHASED,
      products: { create: { productId: products[0].id } },
      metrics: {
        create: { testResultId: metabolicResult.id, metricKey: 'glucose' },
      },
    },
  });
  await prisma.challengeEnrollment.create({
    data: {
      challengeId: metabolicChallenge.id,
      customerId: customer.id,
      recordId: demoRecord.id,
      counselorId: counselor.id,
    },
  });

  // ---- CallLog demo rows + no-show bookings (contact-surfacing evidence layer) ----
  // Seed intent: counselor's island → noShowWithoutContactRate = 0.5
  //   - noShowBookingA: NO_SHOW + NO_ANSWER CallLog   → contacted   (0 uncontacted)
  //   - noShowBookingB: NO_SHOW + no CallLog (intentional) → uncontacted (1 uncontacted)
  //   → 1 uncontacted / 2 NO_SHOW total = 0.5  (AC-6 island A pattern)
  await prisma.callLog.create({
    data: {
      bookingId: demoBooking.id,
      counselorId: counselor.id,
      outcome: CallOutcome.CONNECTED,
      note: '통화 연결 — 예약 확인 완료.',
    },
  });

  const noShowSlotA = await prisma.availabilitySlot.create({
    data: {
      counselorId: counselor.id,
      startAt: minutes(-300),
      endAt: minutes(-270),
      isOpen: false,
    },
  });
  const noShowBookingA = await prisma.booking.create({
    data: {
      slotId: noShowSlotA.id,
      customerId: customer.id,
      subjectType: SubjectType.CUSTOMER,
      subjectId: customer.id,
      testResultId: metabolicResult.id,
      status: BookingStatus.NO_SHOW,
      slotStartAt: noShowSlotA.startAt,
      slotEndAt: noShowSlotA.endAt,
    },
  });
  await prisma.callLog.create({
    data: {
      bookingId: noShowBookingA.id,
      counselorId: counselor.id,
      outcome: CallOutcome.NO_ANSWER,
      note: '2회 시도 무응답.',
    },
  });

  const noShowSlotB = await prisma.availabilitySlot.create({
    data: {
      counselorId: counselor.id,
      startAt: minutes(-240),
      endAt: minutes(-210),
      isOpen: false,
    },
  });
  await prisma.booking.create({
    data: {
      slotId: noShowSlotB.id,
      customerId: customer.id,
      subjectType: SubjectType.CUSTOMER,
      subjectId: customer.id,
      testResultId: metabolicResult.id,
      status: BookingStatus.NO_SHOW,
      slotStartAt: noShowSlotB.startAt,
      slotEndAt: noShowSlotB.endAt,
    },
  });
  // No CallLog for noShowBookingB — intentional: 1/2 NO_SHOW uncontacted → noShowWithoutContactRate = 0.5

  const testResultCount = await prisma.testResult.count();
  const slotCount = await prisma.availabilitySlot.count();
  const productCount = await prisma.product.count();
  const challengeCount = await prisma.challenge.count();
  const enrollmentCount = await prisma.challengeEnrollment.count();
  const callLogCount = await prisma.callLog.count();

  // eslint-disable-next-line no-console
  console.log('Seed complete:', {
    accounts: [
      'customer@demo.com  (김고객) ← role=CUSTOMER, Customer profile',
      'family@demo.com    (이가족) ← role=CUSTOMER, Customer profile',
      'counselor@demo.com',
      'counselor2@demo.com',
      'admin@demo.com',
    ],
    password: DEMO_PASSWORD,
    customerId: customer.id,
    familyCustomerId: familyCustomer.id,
    counselorId: counselor.id,
    counselor2Id: counselor2.id,
    familyLinkCode: linkCode,
    biocomTestTypes: Object.values(SERVICE_TYPE_LABELS_KO),
    testResultCount,
    productCount,
    challengeCount,
    challengeEnrollmentCount: enrollmentCount,
    slotCount,
    callLogCount,
  });
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
