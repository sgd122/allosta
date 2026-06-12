import { Injectable, Logger } from '@nestjs/common';
import { BriefGuidanceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OllamaGuidanceGenerator } from './ollama.guidance';
import {
  GuidanceIndicatorInput,
  GuidanceInput,
} from './guidance-generator.interface';
import { TemplateGuidanceGenerator } from './template.guidance';

/** Current guidance row projection returned to the brief (ADR 0014). */
export interface GuidanceResult {
  status: BriefGuidanceStatus;
  model: string | null;
  content: string;
}

/**
 * Orchestrates pre-consultation AI guidance (ADR 0014).
 *
 * Two surfaces:
 *  - `ensureFallbackForBooking` runs on brief open and guarantees exactly one
 *    deterministic FALLBACK row exists for the booking (the reproducibility
 *    floor). It NEVER overwrites an existing UPGRADED row.
 *  - `sweepPendingUpgrades` is the OpsScheduler-driven idempotent upgrade pass:
 *    FALLBACK rows only, upgraded to UPGRADED when local Ollama is reachable.
 *    It NEVER downgrades UPGRADED rows (the `status=FALLBACK` predicate enforces
 *    this structurally).
 */
@Injectable()
export class GuidanceService {
  private readonly logger = new Logger(GuidanceService.name);

  /**
   * Re-entrancy guard for the OpsScheduler sweep. `@Interval` fires on a fixed
   * setInterval timer and does NOT await the previous run, so a slow local-LLM
   * sweep can overlap the next tick and re-issue Ollama requests for the same
   * FALLBACK bookings. This single-instance flag drops overlapping sweeps.
   */
  private isSweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly template: TemplateGuidanceGenerator,
    private readonly ollama: OllamaGuidanceGenerator,
  ) {}

  /**
   * Builds a deterministic template guidance for the booking and ensures a
   * ConsultationBriefGuidance row exists (status=FALLBACK). Idempotent: it only
   * CREATES when absent and only REFRESHES content while the row is still
   * FALLBACK — an existing UPGRADED row is left fully intact (no content
   * clobber on every brief open). Returns the current row {status, model,
   * content}, or null if the booking is missing.
   */
  async ensureFallbackForBooking(
    bookingId: string,
  ): Promise<GuidanceResult | null> {
    const input = await this.buildInput(bookingId);
    if (!input) {
      this.logger.warn(
        `ensureFallbackForBooking: booking ${bookingId} not found; skipping`,
      );
      return null;
    }

    const content = await this.template.generate(input);

    const row = await this.prisma.consultationBriefGuidance.upsert({
      where: { bookingId },
      create: {
        bookingId,
        status: BriefGuidanceStatus.FALLBACK,
        model: null,
        content,
      },
      // Refresh content ONLY while still FALLBACK; an UPGRADED row keeps its
      // gemma content + model intact (the predicate filters to FALLBACK rows).
      update: {},
    });

    // Only re-write when the row is still FALLBACK AND the content actually
    // changed — a fresh upsert already stored this content, so the first brief
    // open needs no second write.
    if (
      row.status === BriefGuidanceStatus.FALLBACK &&
      row.content !== content
    ) {
      const refreshed = await this.prisma.consultationBriefGuidance.update({
        where: { bookingId },
        data: { content },
      });
      return {
        status: refreshed.status,
        model: refreshed.model,
        content: refreshed.content,
      };
    }

    return { status: row.status, model: row.model, content: row.content };
  }

  /**
   * Upgrades pending FALLBACK guidance rows to UPGRADED using local Ollama when
   * it is reachable. Queries ONLY `status=FALLBACK` rows, so UPGRADED rows are
   * never re-touched (no downgrade). Each upgrade is an idempotent update keyed
   * by bookingId. Returns the number of rows upgraded.
   */
  async sweepPendingUpgrades(): Promise<number> {
    // Drop overlapping sweeps: the @Interval timer does not await the prior run.
    if (this.isSweeping) {
      return 0;
    }
    this.isSweeping = true;
    try {
      const available = await this.ollama.available();
      if (!available) {
        return 0;
      }

      const pending = await this.prisma.consultationBriefGuidance.findMany({
        where: { status: BriefGuidanceStatus.FALLBACK },
        select: { bookingId: true },
      });
      if (pending.length === 0) {
        return 0;
      }

      let upgraded = 0;
      for (const { bookingId } of pending) {
        const input = await this.buildInput(bookingId);
        if (!input) {
          continue;
        }

        try {
          const content = await this.ollama.generate(input);
          // Re-scope the write to FALLBACK rows so a concurrent open or a prior
          // upgrade is never overwritten (no downgrade, structurally).
          const result = await this.prisma.consultationBriefGuidance.updateMany(
            {
              where: { bookingId, status: BriefGuidanceStatus.FALLBACK },
              data: {
                status: BriefGuidanceStatus.UPGRADED,
                model: this.ollama.model,
                content,
              },
            },
          );
          upgraded += result.count;
        } catch (error: unknown) {
          // Fail-soft: leave the row at FALLBACK so the next sweep retries.
          this.logger.warn(
            `Guidance upgrade failed for booking ${bookingId}: ${this.errorMessage(error)}`,
          );
        }
      }

      if (upgraded > 0) {
        this.logger.log(
          `Guidance sweep upgraded ${upgraded}/${pending.length} booking(s) to UPGRADED (${this.ollama.model})`,
        );
      }
      return upgraded;
    } finally {
      this.isSweeping = false;
    }
  }

  /**
   * Loads the booking's subject + concern and projects the subject's
   * TestResults (normalized, abnormal-aware via `status`) and prior
   * ConsultationRecords (newest first) into a deterministic GuidanceInput.
   * Indicators are sorted by `metricKey asc`; pastRecords by `createdAt desc`.
   * Returns null when the booking is missing.
   */
  private async buildInput(bookingId: string): Promise<GuidanceInput | null> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        subjectType: true,
        subjectId: true,
        concern: true,
      },
    });
    if (!booking) {
      return null;
    }

    const [testResults, pastRecords] = await Promise.all([
      this.prisma.testResult.findMany({
        where: {
          subjectType: booking.subjectType,
          subjectId: booking.subjectId,
        },
        orderBy: { createdAt: 'desc' },
        select: { metrics: true },
      }),
      this.prisma.consultationRecord.findMany({
        where: {
          booking: {
            subjectType: booking.subjectType,
            subjectId: booking.subjectId,
          },
        },
        orderBy: { createdAt: 'desc' },
        select: { outcome: true, summary: true, recommendation: true },
      }),
    ]);

    const indicators = testResults
      .flatMap((tr) => this.normalizeIndicators(tr.metrics))
      .sort((a, b) => a.metricKey.localeCompare(b.metricKey));

    return {
      indicators,
      pastRecords: pastRecords.map((r) => ({
        outcome: r.outcome,
        summary: r.summary,
        recommendation: r.recommendation,
      })),
      concern: booking.concern,
    };
  }

  /**
   * Normalizes a raw `TestResult.metrics` JSON value into typed indicators.
   * Mirrors ConsultationService.normalizeMetrics (array of metric objects; flat
   * key→value object fallback). `status` carries the BioCom 판정 so the template
   * can flag abnormal indicators.
   */
  private normalizeIndicators(raw: unknown): GuidanceIndicatorInput[] {
    const toValue = (v: unknown): number | string | null =>
      typeof v === 'number' || typeof v === 'string' ? v : null;
    const toText = (v: unknown): string | null =>
      typeof v === 'string' ? v : null;

    if (Array.isArray(raw)) {
      const out: GuidanceIndicatorInput[] = [];
      for (const entry of raw) {
        if (typeof entry !== 'object' || entry === null) {
          continue;
        }
        const m = entry as Record<string, unknown>;
        const metricKey = typeof m.metricKey === 'string' ? m.metricKey : null;
        if (!metricKey) {
          continue;
        }
        out.push({
          metricKey,
          label: toText(m.label),
          value: toValue(m.value),
          unit: toText(m.unit),
          status: toText(m.status),
        });
      }
      return out;
    }

    if (raw && typeof raw === 'object') {
      return Object.entries(raw as Record<string, unknown>).map(
        ([metricKey, v]) => ({
          metricKey,
          label: null,
          value: toValue(v),
          unit: null,
          status: null,
        }),
      );
    }

    return [];
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }
}
