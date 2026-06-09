import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AvailabilitySlot, BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSlotDto } from './dto/create-slot.dto';
import { UpdateSlotDto } from './dto/update-slot.dto';

/**
 * A derived-available slot exposed to clients (AC1).
 */
export interface AvailableSlot {
  id: string;
  startAt: Date;
  endAt: Date;
}

/**
 * A single bookable time window in the aggregated calendar (AC2/AC3/AC4).
 *
 * Slots from DIFFERENT counselors that share the same start/end window are
 * collapsed into ONE entry so the customer sees a single bookable time, not one
 * button per counselor. `slotId`/`counselorId` reference a REAL, currently-open
 * slot for that window (the representative the client books). `availableCount`
 * is how many counselors are still free for that window — the time only
 * disappears once every counselor for it is booked.
 */
export interface AggregatedSlot {
  slotId: string;
  counselorId: string;
  startAt: Date;
  endAt: Date;
  availableCount: number;
}

/**
 * Open slots for one calendar day (AC2/AC3/AC4), grouped by local date.
 */
export interface CalendarDay {
  date: string; // YYYY-MM-DD (from startAt, server local tz)
  slots: AggregatedSlot[];
}

/**
 * Business-hours window for the aggregated calendar: a slot's LOCAL start hour
 * must be within [9, 18) (>= 9 and < 18).
 */
const BUSINESS_HOURS_START = 9;
const BUSINESS_HOURS_END = 18;

/** Active booking statuses that block slot deletion (AC-S4). */
const ACTIVE_BOOKING_STATUSES = [BookingStatus.PENDING, BookingStatus.CONFIRMED];

/**
 * Availability is a DERIVED value (plan §2.3(b), single source of truth):
 * a slot is available when it exists, isOpen, starts in the future, and has no
 * active booking. The active set is {PENDING, CONFIRMED} — both block a slot.
 * `isOpen` is an operational flag, NOT a "is booked" flag.
 *
 * Write paths (AC-S1/S2): counselor manages own slots; admin manages any
 * counselor's slots. Overlap guard (half-open interval) enforced in-tx.
 * Deletion blocked when an active booking exists on the slot (AC-S4).
 */
@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Read paths (existing) ───────────────────────────────────────────────

  /** GET /counselors/slots — counselor's own upcoming slots for management (AC-S5). */
  async findOwnSlots(counselorId: string): Promise<AvailabilitySlot[]> {
    return this.prisma.availabilitySlot.findMany({
      where: { counselorId, endAt: { gte: new Date() } },
      orderBy: { startAt: 'asc' },
    });
  }

  async findAvailableSlots(counselorId: string): Promise<AvailableSlot[]> {
    return this.prisma.availabilitySlot.findMany({
      where: {
        counselorId,
        isOpen: true,
        startAt: { gt: new Date() },
        // Active set {PENDING, CONFIRMED} blocks the slot.
        bookings: {
          none: {
            status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
          },
        },
      },
      orderBy: { startAt: 'asc' },
      select: { id: true, startAt: true, endAt: true },
    });
  }

  /**
   * All counselors' open slots, grouped by calendar day (AC2/AC3/AC4).
   *
   * Availability stays a DERIVED value: a slot qualifies when it isOpen, starts
   * in the future, has no active ({PENDING, CONFIRMED}) booking, and falls in
   * business hours [9, 18) by LOCAL start hour.
   *
   * Slots that share the same start/end window across counselors are collapsed
   * into ONE entry (a representative real slot + a count of how many counselors
   * are still free). A time therefore stays available while ANY counselor is
   * free for it, and only disappears once EVERY counselor for that window is
   * booked.
   */
  async findAggregatedCalendar(): Promise<CalendarDay[]> {
    const slots = await this.prisma.availabilitySlot.findMany({
      where: {
        isOpen: true,
        startAt: { gt: new Date() },
        // Active set {PENDING, CONFIRMED} blocks the slot.
        bookings: {
          none: {
            status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
          },
        },
      },
      orderBy: { startAt: 'asc' },
      select: { id: true, counselorId: true, startAt: true, endAt: true },
    });

    // Business-hours filter by LOCAL start hour (server tz; acceptable here).
    const inBusinessHours = slots.filter((slot) => {
      const hour = slot.startAt.getHours();
      return hour >= BUSINESS_HOURS_START && hour < BUSINESS_HOURS_END;
    });

    // Group by local calendar day, then collapse by time window. Slots arrive
    // startAt-asc, so per-day window order is preserved on first insertion.
    const daysByDate = new Map<string, Map<string, AggregatedSlot>>();
    for (const slot of inBusinessHours) {
      const date = this.toLocalDateKey(slot.startAt);
      const windowKey = `${slot.startAt.getTime()}-${slot.endAt.getTime()}`;

      let windows = daysByDate.get(date);
      if (!windows) {
        windows = new Map<string, AggregatedSlot>();
        daysByDate.set(date, windows);
      }

      const existing = windows.get(windowKey);
      if (existing) {
        // Another counselor is free for the same window — bump the count only.
        existing.availableCount += 1;
      } else {
        windows.set(windowKey, {
          slotId: slot.id,
          counselorId: slot.counselorId,
          startAt: slot.startAt,
          endAt: slot.endAt,
          availableCount: 1,
        });
      }
    }

    return Array.from(daysByDate.entries())
      .map(([date, windows]) => ({ date, slots: Array.from(windows.values()) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // ─── Write paths (AC-S1/S2) ──────────────────────────────────────────────

  /**
   * Creates one or more slots for a counselor in a single all-or-nothing
   * transaction (AC-S1). Each slot is checked for overlap in-tx so intra-batch
   * collisions are caught as well as collisions with pre-existing slots.
   *
   * Overlap = half-open intervals: existingStart < newEnd AND existingEnd > newStart.
   * Back-to-back (10–11, 11–12) satisfies existingEnd > newStart as false (11 > 11),
   * so they are correctly ALLOWED.
   */
  async createSlots(
    counselorId: string,
    dtos: CreateSlotDto[],
  ): Promise<AvailabilitySlot[]> {
    return this.prisma.$transaction(async (tx) => {
      const created: AvailabilitySlot[] = [];
      for (const dto of dtos) {
        const startAt = new Date(dto.startAt);
        const endAt = new Date(dto.endAt);
        await this.assertNoOverlapInTx(tx, counselorId, startAt, endAt);
        const slot = await tx.availabilitySlot.create({
          data: { counselorId, startAt, endAt, isOpen: true },
        });
        created.push(slot);
      }
      return created;
    });
  }

  /**
   * Validates that a counselor with the given id exists.
   * Used by admin routes before creating or managing slots (AC-S2 404 guard).
   */
  async assertCounselorExists(counselorId: string): Promise<void> {
    const counselor = await this.prisma.counselor.findUnique({
      where: { id: counselorId },
      select: { id: true },
    });
    if (!counselor) {
      throw new NotFoundException('Counselor not found');
    }
  }

  /**
   * Updates a slot's operational flag and/or time window (AC-S1).
   *
   * @param slotId - The slot to update.
   * @param dto - Fields to update (all optional).
   * @param requestingCounselorId - If provided (counselor route), ownership is
   *   asserted — throws 403 if the slot belongs to a different counselor.
   *   Omit for admin routes.
   */
  async updateSlot(
    slotId: string,
    dto: UpdateSlotDto,
    requestingCounselorId?: string,
  ): Promise<AvailabilitySlot> {
    return this.prisma.$transaction(async (tx) => {
      const slot = await tx.availabilitySlot.findUnique({
        where: { id: slotId },
      });
      if (!slot) {
        throw new NotFoundException('Slot not found');
      }
      if (requestingCounselorId && slot.counselorId !== requestingCounselorId) {
        throw new ForbiddenException('Slot does not belong to this counselor');
      }

      const newStartAt = dto.startAt !== undefined ? new Date(dto.startAt) : slot.startAt;
      const newEndAt = dto.endAt !== undefined ? new Date(dto.endAt) : slot.endAt;

      // Only re-check overlap when the time window is actually changing.
      if (dto.startAt !== undefined || dto.endAt !== undefined) {
        await this.assertNoOverlapInTx(tx, slot.counselorId, newStartAt, newEndAt, slotId);
      }

      return tx.availabilitySlot.update({
        where: { id: slotId },
        data: {
          ...(dto.isOpen !== undefined && { isOpen: dto.isOpen }),
          ...(dto.startAt !== undefined && { startAt: newStartAt }),
          ...(dto.endAt !== undefined && { endAt: newEndAt }),
        },
      });
    });
  }

  /**
   * Deletes a slot (AC-S1/S4).
   *
   * Blocked with 409 when an active (PENDING/CONFIRMED) booking exists.
   * Waitlist rows with offeredSlotId pointing to this slot use onDelete:SetNull
   * and are NOT blocked — deletion nullifies their FK (advisory offer lapses).
   *
   * @param slotId - The slot to delete.
   * @param requestingCounselorId - If provided (counselor route), ownership is
   *   asserted. Omit for admin routes.
   */
  async deleteSlot(
    slotId: string,
    requestingCounselorId?: string,
  ): Promise<AvailabilitySlot> {
    const slot = await this.prisma.availabilitySlot.findUnique({
      where: { id: slotId },
      include: {
        bookings: {
          where: { status: { in: ACTIVE_BOOKING_STATUSES } },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!slot) {
      throw new NotFoundException('Slot not found');
    }
    if (requestingCounselorId && slot.counselorId !== requestingCounselorId) {
      throw new ForbiddenException('Slot does not belong to this counselor');
    }
    if (slot.bookings.length > 0) {
      throw new ConflictException(
        'Cannot delete slot with an active (PENDING/CONFIRMED) booking',
      );
    }

    return this.prisma.availabilitySlot.delete({ where: { id: slotId } });
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  /**
   * Throws 409 if any existing slot for the counselor overlaps with [startAt, endAt).
   * The half-open predicate is: existingStart < newEnd AND existingEnd > newStart.
   * Back-to-back slots (e.g., 10:00–11:00 and 11:00–12:00) are ALLOWED because
   * existingEnd (11:00) > newStart (11:00) is false.
   *
   * @param excludeSlotId - Omit this slot from the check (used during updates).
   */
  private async assertNoOverlapInTx(
    tx: Prisma.TransactionClient,
    counselorId: string,
    startAt: Date,
    endAt: Date,
    excludeSlotId?: string,
  ): Promise<void> {
    const overlap = await tx.availabilitySlot.findFirst({
      where: {
        counselorId,
        ...(excludeSlotId ? { NOT: { id: excludeSlotId } } : {}),
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });
    if (overlap) {
      throw new ConflictException(
        'Slot overlaps with an existing slot for this counselor',
      );
    }
  }

  /**
   * Local-date key (YYYY-MM-DD) for grouping. Uses local getters so it matches
   * the local-hour business-window filter.
   */
  private toLocalDateKey(value: Date): string {
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
