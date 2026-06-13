import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStatus,
  CallOutcome,
  ConsultationRecord,
  ConsultationRecordMetric,
  ConsultationRecordProduct,
  FamilyLinkStatus,
  Outcome,
  SubjectType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/ownership/ownership.service';
import {
  CreateConsultationRecordDto,
  MetricRefDto,
  UpdateConsultationRecordDto,
} from './dto/create-consultation-record.dto';
import { LogCallDto, UpdateCallLogDto } from './dto/log-call.dto';
import {
  GuidanceResult,
  GuidanceService,
} from './guidance/guidance.service';

/**
 * A booking on the counselor's own schedule (AC4/AC14 "본인 일정 확인").
 * Includes NO_SHOW so the counselor can review missed sessions; excludes only
 * CANCELLED (withdrawn by the customer — never a session that happened). The
 * `status` field drives the 예약상태 axis; `hasRecord` drives the 기록상태 axis.
 */
export interface CounselorScheduleEntry {
  bookingId: string;
  slot: { startAt: Date; endAt: Date };
  subjectType: SubjectType;
  subjectId: string;
  subjectName: string;
  /** The customer who applied for the booking (신청 고객) — display lead. */
  customerId: string;
  customerName: string;
  hasRecord: boolean;
  status: BookingStatus;
}

/**
 * A consultation record returned with its linked products and metrics (AC4/AC9).
 */
export type ConsultationRecordWithRelations = ConsultationRecord & {
  products: ConsultationRecordProduct[];
  metrics: ConsultationRecordMetric[];
};

/** Product catalog entry — used by the consultation record form (AC11). */
export interface ProductCatalogItem {
  id: string;
  name: string;
  category: string;
}

/** Challenge catalog entry — used by the consultation record form (AC4). */
export interface ChallengeCatalogItem {
  id: string;
  name: string;
  category: string;
  description: string;
  /** Advisory hint only (sort/grouping); never filters the offered catalog. */
  linkedServiceType: string | null;
}

/** A single measured metric within a test result (e.g. vitaminD 18.5 ng/mL). */
export interface TestMetricDto {
  metricKey: string;
  // label/referenceRange/status are the BioCom interpretation superset (ADR 0007).
  // Surfaced so the counselor record form renders the SAME 검사 결과서 layout the
  // customer sees (friendly label + 참조범위 + 판정 badge), not a bare metricKey.
  label: string | null;
  value: number | string | null;
  unit: string | null;
  referenceRange: string | null;
  status: string | null;
}

/** Test result with metrics exposed for the record-form metric autosuggest (AC12). */
export interface SubjectTestResultDto {
  id: string;
  serviceType: string;
  metrics: TestMetricDto[];
  createdAt: Date;
}

/** Own written record with enriched relations — for AC16 re-view on schedule. */
export interface CounselorRecordEntry {
  id: string;
  bookingId: string;
  summary: string;
  recommendation: string;
  followUp: string | null;
  actions: ConsultationRecord['actions'];
  outcome: ConsultationRecord['outcome'];
  createdAt: Date;
  slot: { startAt: Date; endAt: Date };
  subjectType: SubjectType;
  subjectId: string;
  subjectName: string;
  customerName: string;
  products: { productId: string; name: string; category: string }[];
  metrics: { testResultId: string; metricKey: string }[];
}

/** A single out-of-range / interpreted indicator surfaced in the brief (AC-P1). */
export interface BriefIndicator {
  testResultId: string;
  serviceType: string;
  metricKey: string;
  label: string | null;
  value: number | string | null;
  unit: string | null;
  referenceRange: string | null;
  status: string | null;
}

/** A prior consultation record for the brief subject (newest first, AC-P1). */
export interface BriefPastRecord {
  id: string;
  createdAt: Date;
  outcome: Outcome;
  summary: string;
  recommendation: string;
}

/** One ACCEPTED family member linked to the subject (read-only context). */
export interface BriefFamilyContext {
  customerId: string;
  name: string;
}

/**
 * One previously logged call attempt surfaced in the brief (newest first, ADR
 * 0016). Unlike the creation receipt (CallLogReceipt) this DOES include `note`:
 * the brief is shown ONLY to the assigned counselor inside the SAME ownership
 * boundary as `phone` (assertBookingOwnedByCounselor), so surfacing the memo
 * back to that counselor is consistent containment — it lets them review and
 * correct what they logged. It is still never logged, nor surfaced in any admin
 * aggregation (analytics reads `outcome` only).
 */
export interface BriefCallLog {
  id: string;
  outcome: CallOutcome;
  note: string | null;
  createdAt: Date;
}

/**
 * Read-only, deterministic pre-consultation brief for a booking (AC-P1). All
 * fields are derived projections of existing data (TestResult metrics, past
 * ConsultationRecords, ACCEPTED FamilyLink context, booking.concern) — no new
 * source of truth. `concern` is write-only into this brief: it is surfaced to
 * the counselor here but never read back to the customer.
 */
export interface BookingBrief {
  bookingId: string;
  subjectType: SubjectType;
  subjectId: string;
  subjectName: string;
  // Applicant customer's phone, surfaced PLAINTEXT for click-to-call (ADR 0016).
  // Exposed ONLY here, inside the existing brief ownership boundary
  // (assertBookingOwnedByCounselor) — never added to the schedule list or any
  // analytics response type, and never written to logs (PII containment).
  phone: string;
  concern: string | null;
  indicators: BriefIndicator[];
  pastRecords: BriefPastRecord[];
  family: BriefFamilyContext[];
  // The booking's logged call attempts (newest first, ADR 0016). Surfaced inside
  // the same ownership boundary as `phone` so the assigned counselor can review
  // and correct what they logged. Empty when no calls have been logged.
  callLogs: BriefCallLog[];
  // Pre-consultation AI guidance (ADR 0014): how to conduct the UPCOMING
  // consultation, derived from the indicators + pastRecords + concern. FALLBACK
  // is ensured on brief open; the sweep upgrades it to UPGRADED when Ollama is
  // present. Null only if the booking row could not be loaded for guidance.
  guidance: GuidanceResult | null;
}

/**
 * Creation receipt returned after a call is logged (ADR 0016). Intentionally
 * OMITS `note`: the memo is write-only, PII-adjacent evidence and is never echoed
 * back in the response (containment principle — same reason it is never logged or
 * aggregated). The counselor already holds the note they just submitted.
 */
export interface CallLogReceipt {
  id: string;
  bookingId: string;
  counselorId: string;
  outcome: CallOutcome;
  createdAt: Date;
}

@Injectable()
export class ConsultationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly guidance: GuidanceService,
  ) {}

  /**
   * Returns the counselor's own bookings (PENDING, CONFIRMED, COMPLETED, NO_SHOW
   * — excluding only CANCELLED) with the subject resolved to a display name, a
   * flag for whether a record already exists (기록상태), and the booking status
   * itself (예약상태) for the 2-axis schedule display (AC4/AC14). NO_SHOW is
   * included so missed sessions remain reviewable and filterable on the console.
   */
  async getCounselorSchedule(
    counselorId: string,
  ): Promise<CounselorScheduleEntry[]> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: {
          in: [
            BookingStatus.PENDING,
            BookingStatus.CONFIRMED,
            BookingStatus.COMPLETED,
            BookingStatus.NO_SHOW,
          ],
        },
        slot: { counselorId },
      },
      select: {
        id: true,
        status: true,
        subjectType: true,
        subjectId: true,
        customerId: true,
        slot: { select: { startAt: true, endAt: true } },
        record: { select: { id: true } },
      },
      orderBy: { slot: { startAt: 'asc' } },
    });

    return Promise.all(
      bookings.map(async (booking) => ({
        bookingId: booking.id,
        slot: { startAt: booking.slot.startAt, endAt: booking.slot.endAt },
        subjectType: booking.subjectType,
        subjectId: booking.subjectId,
        subjectName: await this.resolveSubjectName(
          booking.subjectType,
          booking.subjectId,
        ),
        customerId: booking.customerId,
        customerName: await this.resolveCustomerName(booking.customerId),
        hasRecord: booking.record !== null,
        status: booking.status,
      })),
    );
  }

  /**
   * Creates a consultation record for one of the counselor's own bookings,
   * linking interested products and discussed test metrics atomically (AC4/AC9).
   */
  async createRecord(
    counselorId: string,
    dto: CreateConsultationRecordDto,
  ): Promise<ConsultationRecordWithRelations> {
    // (a) Ownership: only the counselor assigned to the booking may record it.
    await this.ownership.assertBookingOwnedByCounselor(
      counselorId,
      dto.bookingId,
    );

    // (b) One record per booking (ConsultationRecord.bookingId is @unique).
    const existing = await this.prisma.consultationRecord.findUnique({
      where: { bookingId: dto.bookingId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'A consultation record already exists for this booking',
      );
    }

    // (c) Every referenced metric must belong to the booking's subject (AC9).
    const metricRefs = dto.metricRefs ?? [];
    if (metricRefs.length > 0) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: dto.bookingId },
        select: { subjectType: true, subjectId: true },
      });
      // Ownership guard above guarantees the booking exists, but narrow for TS.
      if (!booking) {
        throw new ForbiddenException('Booking not found');
      }
      await this.assertMetricsBelongToSubject(
        booking.subjectType,
        booking.subjectId,
        metricRefs,
      );
    }

    // (c2) Optional challenge enrollment (AC4). The existence guard runs PRE-
    // transaction — an intentional UX-over-performance round-trip that yields a
    // clean 404 instead of a mid-transaction P2003, mirroring the metric guard
    // above. We also resolve the booking's customer (the enrollee). Code never
    // gates on `outcome`: any outcome may enroll; the PURCHASED association is a
    // UI/analytics convention, not a server rule.
    let enrollCustomerId: string | null = null;
    if (dto.challengeId) {
      const [challenge, enrollBooking] = await Promise.all([
        this.prisma.challenge.findUnique({
          where: { id: dto.challengeId },
          select: { id: true },
        }),
        this.prisma.booking.findUnique({
          where: { id: dto.bookingId },
          select: { customerId: true },
        }),
      ]);
      if (!challenge) {
        throw new NotFoundException('Challenge not found');
      }
      // Ownership guard (a) guarantees the booking exists; narrow for TS.
      if (!enrollBooking) {
        throw new ForbiddenException('Booking not found');
      }
      enrollCustomerId = enrollBooking.customerId;
    }

    // (d) Persist the record and its joins in a single transaction.
    const record = await this.prisma.$transaction(async (tx) => {
      const record = await tx.consultationRecord.create({
        data: {
          bookingId: dto.bookingId,
          counselorId,
          summary: dto.summary,
          recommendation: dto.recommendation,
          followUp: dto.followUp ?? null,
          actions: dto.actions,
          outcome: dto.outcome,
        },
      });

      if (dto.interestedProductIds.length > 0) {
        await tx.consultationRecordProduct.createMany({
          data: dto.interestedProductIds.map((productId) => ({
            recordId: record.id,
            productId,
          })),
        });
      }

      if (metricRefs.length > 0) {
        await tx.consultationRecordMetric.createMany({
          data: metricRefs.map((ref) => ({
            recordId: record.id,
            testResultId: ref.testResultId,
            metricKey: ref.metricKey,
          })),
        });
      }

      // AC13: transition the booking to COMPLETED atomically with record creation.
      await tx.booking.update({
        where: { id: dto.bookingId },
        data: { status: BookingStatus.COMPLETED },
      });

      // AC4: enroll the customer into the selected challenge atomically. Guarded
      // by `if (dto.challengeId)` so absent → zero behavior change. Existence +
      // customer were validated pre-txn (c2); @@unique([recordId]) bounds it to
      // one enrollment per record.
      if (dto.challengeId) {
        await tx.challengeEnrollment.create({
          data: {
            challengeId: dto.challengeId,
            recordId: record.id,
            customerId: enrollCustomerId!,
            counselorId,
          },
        });
      }

      const products = await tx.consultationRecordProduct.findMany({
        where: { recordId: record.id },
      });
      const metrics = await tx.consultationRecordMetric.findMany({
        where: { recordId: record.id },
      });

      return { ...record, products, metrics };
    });

    // No AI side-effect here (ADR 0014 redesign): AI guidance is a PRE-
    // consultation artifact keyed by booking, generated lazily on brief open —
    // createRecord no longer touches AI.
    return record;
  }

  /**
   * Updates an existing consultation record owned by the counselor. Notes and
   * outcome are overwritten; interested products and discussed metrics are
   * replaced wholesale (delete-all + recreate) in a single transaction. The
   * booking keeps its COMPLETED status. Same metric-ownership guard as create.
   */
  async updateRecord(
    counselorId: string,
    recordId: string,
    dto: UpdateConsultationRecordDto,
  ): Promise<ConsultationRecordWithRelations> {
    const record = await this.prisma.consultationRecord.findUnique({
      where: { id: recordId },
      select: {
        id: true,
        counselorId: true,
        booking: { select: { subjectType: true, subjectId: true } },
      },
    });

    if (!record) {
      throw new NotFoundException('Consultation record not found');
    }
    if (record.counselorId !== counselorId) {
      throw new ForbiddenException(
        'Consultation record does not belong to the current counselor',
      );
    }

    // Every referenced metric must belong to the booking's subject (AC9).
    const metricRefs = dto.metricRefs ?? [];
    if (metricRefs.length > 0) {
      await this.assertMetricsBelongToSubject(
        record.booking.subjectType,
        record.booking.subjectId,
        metricRefs,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.consultationRecord.update({
        where: { id: recordId },
        data: {
          summary: dto.summary,
          recommendation: dto.recommendation,
          followUp: dto.followUp ?? null,
          actions: dto.actions,
          outcome: dto.outcome,
        },
      });

      await tx.consultationRecordProduct.deleteMany({ where: { recordId } });
      await tx.consultationRecordMetric.deleteMany({ where: { recordId } });

      if (dto.interestedProductIds.length > 0) {
        await tx.consultationRecordProduct.createMany({
          data: dto.interestedProductIds.map((productId) => ({
            recordId,
            productId,
          })),
        });
      }

      if (metricRefs.length > 0) {
        await tx.consultationRecordMetric.createMany({
          data: metricRefs.map((ref) => ({
            recordId,
            testResultId: ref.testResultId,
            metricKey: ref.metricKey,
          })),
        });
      }

      const products = await tx.consultationRecordProduct.findMany({
        where: { recordId },
      });
      const metrics = await tx.consultationRecordMetric.findMany({
        where: { recordId },
      });

      return { ...updated, products, metrics };
    });
  }

  // ── Supporting endpoints for AC11/AC12/AC16 ──────────────────────────────

  /**
   * Returns the full product catalog for the consultation record form (AC11).
   * Sorted by category then name so the UI can group without extra work.
   */
  async getProducts(): Promise<ProductCatalogItem[]> {
    return this.prisma.product.findMany({
      select: { id: true, name: true, category: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Returns the full challenge catalog for the consultation record form (AC4).
   * Sorted by category then name. `linkedServiceType` is advisory only — the UI
   * offers the full catalog and never hard-filters by it.
   */
  async getChallenges(): Promise<ChallengeCatalogItem[]> {
    return this.prisma.challenge.findMany({
      select: {
        id: true,
        name: true,
        category: true,
        description: true,
        linkedServiceType: true,
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Returns all TestResults for the booking's subject so the record form can
   * render metric checkboxes autopopulated from real data (AC12).
   * Ownership: caller must be the counselor assigned to that booking.
   */
  async getBookingSubjectTestResults(
    counselorId: string,
    bookingId: string,
  ): Promise<SubjectTestResultDto[]> {
    await this.ownership.assertBookingOwnedByCounselor(counselorId, bookingId);

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { subjectType: true, subjectId: true },
    });
    if (!booking) throw new ForbiddenException('Booking not found');

    const results = await this.prisma.testResult.findMany({
      where: { subjectType: booking.subjectType, subjectId: booking.subjectId },
      orderBy: { createdAt: 'desc' },
    });

    return results.map((r) => ({
      id: r.id,
      serviceType: r.serviceType,
      metrics: this.normalizeMetrics(r.metrics),
      createdAt: r.createdAt,
    }));
  }

  /**
   * Assembles the read-only, deterministic pre-consultation brief for a booking
   * (AC-P1) and records the counselor's first open (AC-P7). Ownership reuses
   * `assertBookingOwnedByCounselor` — no new auth surface (AC-P2).
   *
   * The brief is a pure projection of existing data:
   *  - indicators: the subject's TestResult metrics (sorted `metricKey asc`),
   *  - pastRecords: prior ConsultationRecords for the subject (`createdAt desc`),
   *  - family: ACCEPTED FamilyLink members (inviter/invitee pairs, like ownership),
   *  - concern: the customer's optional pre-question (write-only into the brief).
   *
   * `briefOpenedAt` is set via a conditional `updateMany` guarded on
   * `briefOpenedAt: null` so concurrent opens stay DB-idempotent (no read-then-
   * write; the second call updates zero rows).
   */
  async getBookingBrief(
    counselorId: string,
    bookingId: string,
  ): Promise<BookingBrief> {
    await this.ownership.assertBookingOwnedByCounselor(counselorId, bookingId);

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        customerId: true,
        subjectType: true,
        subjectId: true,
        concern: true,
        // Plaintext phone for click-to-call (ADR 0016). Narrow `select` keeps the
        // customer projection to phone only — no other PII row is loaded — and it
        // is surfaced exclusively in this brief response.
        customer: { select: { phone: true } },
      },
    });
    if (!booking) {
      throw new ForbiddenException('Booking not found');
    }

    // Family context is only meaningful when the consultation is about a LINKED
    // family member's data — i.e. the applicant (booking.customerId) booked using
    // a family account's test result, so the subject differs from the applicant.
    // For a self-consultation (subject == applicant) it is suppressed: the
    // counselor is reviewing the applicant's own data, not a family member's.
    const isFamilyConsultation =
      booking.subjectType === SubjectType.CUSTOMER &&
      booking.subjectId !== booking.customerId;

    const [testResults, pastRecords, family, subjectName, callLogs] =
      await Promise.all([
        this.prisma.testResult.findMany({
          where: {
            subjectType: booking.subjectType,
            subjectId: booking.subjectId,
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            serviceType: true,
            metrics: true,
          },
        }),
        this.prisma.consultationRecord.findMany({
          where: {
            booking: {
              subjectType: booking.subjectType,
              subjectId: booking.subjectId,
            },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            createdAt: true,
            outcome: true,
            summary: true,
            recommendation: true,
          },
        }),
        isFamilyConsultation
          ? this.resolveFamilyContext(booking.subjectType, booking.subjectId)
          : Promise.resolve<BriefFamilyContext[]>([]),
        this.resolveSubjectName(booking.subjectType, booking.subjectId),
        // This booking's logged call attempts, newest first (ADR 0016). Scoped to
        // THIS booking only — the ownership of the brief itself
        // (assertBookingOwnedByCounselor above) is the access boundary.
        this.prisma.callLog.findMany({
          where: { bookingId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            outcome: true,
            note: true,
            createdAt: true,
          },
        }),
      ]);

    const indicators = testResults
      .flatMap((tr) =>
        this.normalizeMetrics(tr.metrics).map((m) => ({
          testResultId: tr.id,
          serviceType: tr.serviceType,
          metricKey: m.metricKey,
          label: m.label,
          value: m.value,
          unit: m.unit,
          referenceRange: m.referenceRange,
          status: m.status,
        })),
      )
      .sort((a, b) => a.metricKey.localeCompare(b.metricKey));

    // Pre-consultation AI guidance (ADR 0014): ensure a deterministic FALLBACK
    // row exists for this booking (idempotent; never clobbers an UPGRADED row).
    // The gemma UPGRADE happens later via the OpsScheduler sweep, off this path.
    const guidance = await this.guidance.ensureFallbackForBooking(bookingId);

    // DB-idempotent first-open marker: only writes when still null (AC-P7).
    await this.prisma.booking.updateMany({
      where: { id: bookingId, briefOpenedAt: null },
      data: { briefOpenedAt: new Date() },
    });

    return {
      bookingId,
      subjectType: booking.subjectType,
      subjectId: booking.subjectId,
      subjectName,
      phone: booking.customer.phone,
      concern: booking.concern,
      indicators,
      pastRecords,
      family,
      callLogs,
      guidance,
    };
  }

  /**
   * Records one click-to-call attempt against the booking as evidence for a
   * possible no-show override (contact surfacing, ADR 0016). Ownership reuses
   * `assertBookingOwnedByCounselor` — the SAME boundary as the brief, so a
   * counselor can only log calls on their own bookings (AC-5), with no new auth
   * surface (P2).
   *
   * NON-DESTRUCTIVE, loosely coupled (P5): this NEVER writes Booking.status.
   * Attendance remains single-source-of-truth on Booking, transitioned only by
   * PATCH /bookings/:id/attendance — the CallLog is pure evidence (AC-7). The
   * outcome enum is validated at the DTO layer; `note` is optional and is never
   * logged or surfaced in any admin aggregation.
   */
  async logCall(
    counselorId: string,
    bookingId: string,
    dto: LogCallDto,
  ): Promise<CallLogReceipt> {
    await this.ownership.assertBookingOwnedByCounselor(counselorId, bookingId);

    // `note` is persisted but deliberately excluded from the returned `select`
    // so it is never serialized into the 201 response (PII-adjacent containment).
    return this.prisma.callLog.create({
      data: {
        bookingId,
        counselorId,
        outcome: dto.outcome,
        note: dto.note ?? null,
      },
      select: {
        id: true,
        bookingId: true,
        counselorId: true,
        outcome: true,
        createdAt: true,
      },
    });
  }

  /**
   * Edits a previously logged call so a counselor can correct a mis-clicked
   * outcome or refine the memo (ADR 0016). Ownership reuses the SAME boundary as
   * logCall/the brief (`assertBookingOwnedByCounselor`) — no new auth surface
   * (P2) — and the CallLog must belong to that booking (else 404), closing the
   * cross-booking edit vector.
   *
   * Only `outcome` + `note` are mutable; the row's booking/counselor binding and
   * createdAt are immutable. Like logCall this is NON-DESTRUCTIVE and loosely
   * coupled (P5): it NEVER writes Booking.status. Editing an outcome recomputes
   * admin analytics live (aggregates are computed on read from CallLog.outcome),
   * so no migration/backfill is needed. Returns the same note-free receipt as
   * logCall (containment — the note is never echoed in the response).
   */
  async updateCallLog(
    counselorId: string,
    bookingId: string,
    callId: string,
    dto: UpdateCallLogDto,
  ): Promise<CallLogReceipt> {
    await this.ownership.assertBookingOwnedByCounselor(counselorId, bookingId);

    // The CallLog must exist AND belong to this booking — otherwise a counselor
    // could edit a call from a DIFFERENT booking they happen to own (or one they
    // do not). Scoping the existence check to bookingId closes that vector.
    const existing = await this.prisma.callLog.findUnique({
      where: { id: callId },
      select: { bookingId: true },
    });
    if (!existing || existing.bookingId !== bookingId) {
      throw new NotFoundException('Call log not found for this booking');
    }

    // Update `outcome` + `note` ONLY. Booking.status is never touched (P5). The
    // returned `select` omits `note` so it is never serialized into the response
    // (PII-adjacent containment, mirroring logCall).
    return this.prisma.callLog.update({
      where: { id: callId },
      data: {
        outcome: dto.outcome,
        note: dto.note ?? null,
      },
      select: {
        id: true,
        bookingId: true,
        counselorId: true,
        outcome: true,
        createdAt: true,
      },
    });
  }

  /**
   * Deletes a previously logged call so a counselor can remove an erroneously
   * created entry (ADR 0016). Ownership reuses the SAME boundary as
   * logCall/updateCallLog (`assertBookingOwnedByCounselor`) — no new auth
   * surface (P2) — and the CallLog must belong to that booking (else 404),
   * closing the cross-booking delete vector.
   *
   * NON-DESTRUCTIVE, loosely coupled (P5): NEVER writes Booking.status.
   * Deleting a row recomputes admin analytics live (aggregates are computed on
   * read from CallLog.outcome), so no migration/backfill is needed. Returns
   * void — the row no longer exists.
   */
  async deleteCallLog(
    counselorId: string,
    bookingId: string,
    callId: string,
  ): Promise<void> {
    await this.ownership.assertBookingOwnedByCounselor(counselorId, bookingId);

    // The CallLog must exist AND belong to this booking — same vector check as
    // updateCallLog: scoping to bookingId closes the cross-booking delete path.
    const existing = await this.prisma.callLog.findUnique({
      where: { id: callId },
      select: { bookingId: true },
    });
    if (!existing || existing.bookingId !== bookingId) {
      throw new NotFoundException('Call log not found for this booking');
    }

    await this.prisma.callLog.delete({ where: { id: callId } });
  }

  /**
   * Returns ACCEPTED family members directly linked to the subject (one hop,
   * live). Mirrors OwnershipService.assertSubjectOwnedByCustomer: ACCEPTED
   * status only, reading the inviter/invitee pair in either direction.
   */
  private async resolveFamilyContext(
    subjectType: SubjectType,
    subjectId: string,
  ): Promise<BriefFamilyContext[]> {
    if (subjectType !== SubjectType.CUSTOMER) {
      return [];
    }

    const links = await this.prisma.familyLink.findMany({
      where: {
        status: FamilyLinkStatus.ACCEPTED,
        OR: [
          { inviterCustomerId: subjectId },
          { inviteeCustomerId: subjectId },
        ],
      },
      select: { inviterCustomerId: true, inviteeCustomerId: true },
    });

    const memberIds = new Set<string>();
    for (const link of links) {
      if (link.inviterCustomerId === subjectId) {
        if (link.inviteeCustomerId) {
          memberIds.add(link.inviteeCustomerId);
        }
      } else {
        memberIds.add(link.inviterCustomerId);
      }
    }
    if (memberIds.size === 0) {
      return [];
    }

    const members = await this.prisma.customer.findMany({
      where: { id: { in: [...memberIds] } },
      select: { id: true, name: true },
    });

    return members
      .map((m) => ({ customerId: m.id, name: m.name }))
      .sort((a, b) => a.customerId.localeCompare(b.customerId));
  }

  /**
   * Returns all of the counselor's own written records with enriched relations
   * (product names, metric keys, slot time, subject name) for AC16 re-view.
   */
  async getCounselorRecords(
    counselorId: string,
  ): Promise<CounselorRecordEntry[]> {
    const records = await this.prisma.consultationRecord.findMany({
      where: { counselorId },
      include: {
        booking: {
          select: {
            subjectType: true,
            subjectId: true,
            customerId: true,
            slot: { select: { startAt: true, endAt: true } },
          },
        },
        products: {
          include: {
            product: { select: { id: true, name: true, category: true } },
          },
        },
        metrics: { select: { testResultId: true, metricKey: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      records.map(async (r) => ({
        id: r.id,
        bookingId: r.bookingId,
        summary: r.summary,
        recommendation: r.recommendation,
        followUp: r.followUp,
        actions: r.actions,
        outcome: r.outcome,
        createdAt: r.createdAt,
        slot: r.booking.slot,
        subjectType: r.booking.subjectType,
        subjectId: r.booking.subjectId,
        subjectName: await this.resolveSubjectName(
          r.booking.subjectType,
          r.booking.subjectId,
        ),
        customerName: await this.resolveCustomerName(r.booking.customerId),
        products: r.products.map((p) => ({
          productId: p.productId,
          name: p.product.name,
          category: p.product.category,
        })),
        metrics: r.metrics.map((m) => ({
          testResultId: m.testResultId,
          metricKey: m.metricKey,
        })),
      })),
    );
  }

  /**
   * Resolves a subject (always CUSTOMER after symmetric redesign) to a display name.
   */
  private async resolveSubjectName(
    _subjectType: SubjectType,
    subjectId: string,
  ): Promise<string> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: subjectId },
      select: { name: true },
    });
    return customer?.name ?? 'Unknown';
  }

  /** Resolves the applicant customer (신청 고객) to a display name. */
  private async resolveCustomerName(customerId: string): Promise<string> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { name: true },
    });
    return customer?.name ?? 'Unknown';
  }

  /**
   * Normalizes the raw `TestResult.metrics` JSON into a typed array of
   * { metricKey, value, unit }. The seed stores metrics as an array of such
   * objects; we also defensively handle a flat key→value object shape.
   */
  private normalizeMetrics(raw: unknown): TestMetricDto[] {
    const toEntry = (m: Record<string, unknown>): TestMetricDto | null => {
      const metricKey = typeof m.metricKey === 'string' ? m.metricKey : null;
      if (!metricKey) return null;
      const value =
        typeof m.value === 'number' || typeof m.value === 'string'
          ? m.value
          : null;
      const unit = typeof m.unit === 'string' ? m.unit : null;
      const label = typeof m.label === 'string' ? m.label : null;
      const referenceRange =
        typeof m.referenceRange === 'string' ? m.referenceRange : null;
      const status = typeof m.status === 'string' ? m.status : null;
      return { metricKey, label, value, unit, referenceRange, status };
    };

    if (Array.isArray(raw)) {
      return raw
        .filter(
          (m): m is Record<string, unknown> =>
            typeof m === 'object' && m !== null,
        )
        .map(toEntry)
        .filter((m): m is TestMetricDto => m !== null);
    }

    if (raw && typeof raw === 'object') {
      return Object.entries(raw as Record<string, unknown>).map(
        ([metricKey, v]) => ({
          metricKey,
          label: null,
          value: typeof v === 'number' || typeof v === 'string' ? v : null,
          unit: null,
          referenceRange: null,
          status: null,
        }),
      );
    }

    return [];
  }

  /**
   * Verifies each referenced TestResult exists AND its (subjectType, subjectId)
   * matches the booking's subject — a metric may only be linked when it belongs
   * to the consultation's subject (AC9 ownership reuse). Throws otherwise.
   */
  private async assertMetricsBelongToSubject(
    subjectType: SubjectType,
    subjectId: string,
    metricRefs: MetricRefDto[],
  ): Promise<void> {
    const testResultIds = [
      ...new Set(metricRefs.map((ref) => ref.testResultId)),
    ];

    const testResults = await this.prisma.testResult.findMany({
      where: { id: { in: testResultIds } },
      select: { id: true, subjectType: true, subjectId: true },
    });
    const byId = new Map(testResults.map((tr) => [tr.id, tr]));

    for (const ref of metricRefs) {
      const testResult = byId.get(ref.testResultId);
      if (
        !testResult ||
        testResult.subjectType !== subjectType ||
        testResult.subjectId !== subjectId
      ) {
        throw new ForbiddenException(
          'Referenced test result does not belong to the consultation subject',
        );
      }
    }
  }
}
