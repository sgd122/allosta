import { Injectable, Logger } from '@nestjs/common';
import { AiSummaryStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OllamaSummarizer } from './ollama.summarizer';
import {
  SummaryInput,
  SummaryMetricInput,
} from './summary-generator.interface';
import { TemplateSummarizer } from './template.summarizer';

/**
 * Orchestrates post-consultation AI summaries (ADR 0014).
 *
 * Two surfaces:
 *  - `persistFallback` runs synchronously right after createRecord commits and
 *    guarantees exactly one deterministic FALLBACK row (the reproducibility
 *    floor; never inside the record transaction).
 *  - `sweepPendingUpgrades` is the OpsScheduler-driven idempotent upgrade pass:
 *    FALLBACK rows only, upgraded to UPGRADED when local Ollama is reachable.
 *    It NEVER downgrades UPGRADED rows (the `status=FALLBACK` predicate enforces
 *    this structurally).
 */
@Injectable()
export class SummaryService {
  private readonly logger = new Logger(SummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly template: TemplateSummarizer,
    private readonly ollama: OllamaSummarizer,
  ) {}

  /**
   * Generates a deterministic template summary for the record and UPSERTs a
   * ConsultationAiSummary row keyed by recordId with status=FALLBACK. Idempotent
   * (re-running keeps a single row) and synchronous-fast (the template is pure,
   * no I/O). Called AFTER the createRecord transaction commits.
   */
  async persistFallback(recordId: string): Promise<void> {
    const input = await this.loadSummaryInput(recordId);
    if (!input) {
      this.logger.warn(
        `persistFallback: record ${recordId} not found; skipping`,
      );
      return;
    }

    const content = await this.template.generate(input);

    await this.prisma.consultationAiSummary.upsert({
      where: { recordId },
      create: {
        recordId,
        status: AiSummaryStatus.FALLBACK,
        model: null,
        content,
      },
      update: {
        status: AiSummaryStatus.FALLBACK,
        model: null,
        content,
      },
    });

    this.logger.log(`Summary FALLBACK persisted for record ${recordId}`);
  }

  /**
   * Upgrades pending FALLBACK summaries to UPGRADED using local Ollama when it
   * is reachable. Queries ONLY `status=FALLBACK` rows, so UPGRADED rows are
   * never re-touched (no downgrade). Each upgrade is an idempotent upsert keyed
   * by recordId. Returns the number of rows upgraded.
   */
  async sweepPendingUpgrades(): Promise<number> {
    const available = await this.ollama.available();
    if (!available) {
      return 0;
    }

    const pending = await this.prisma.consultationAiSummary.findMany({
      where: { status: AiSummaryStatus.FALLBACK },
      select: { recordId: true },
    });
    if (pending.length === 0) {
      return 0;
    }

    let upgraded = 0;
    for (const { recordId } of pending) {
      const input = await this.loadSummaryInput(recordId);
      if (!input) {
        continue;
      }

      try {
        const content = await this.ollama.generate(input);
        await this.prisma.consultationAiSummary.upsert({
          where: { recordId },
          create: {
            recordId,
            status: AiSummaryStatus.UPGRADED,
            model: this.ollama.model,
            content,
          },
          update: {
            status: AiSummaryStatus.UPGRADED,
            model: this.ollama.model,
            content,
          },
        });
        upgraded += 1;
      } catch (error: unknown) {
        // Fail-soft: leave the row at FALLBACK so the next sweep retries.
        this.logger.warn(
          `Summary upgrade failed for record ${recordId}: ${this.errorMessage(error)}`,
        );
      }
    }

    if (upgraded > 0) {
      this.logger.log(
        `Summary sweep upgraded ${upgraded}/${pending.length} record(s) to UPGRADED (${this.ollama.model})`,
      );
    }
    return upgraded;
  }

  /**
   * Loads the record (+ relations) and projects it into a deterministic
   * SummaryInput. Discussed metrics are resolved against their TestResult JSON
   * and sorted by `metricKey asc` so the template output is reproducible.
   */
  private async loadSummaryInput(
    recordId: string,
  ): Promise<SummaryInput | null> {
    const record = await this.prisma.consultationRecord.findUnique({
      where: { id: recordId },
      select: {
        id: true,
        outcome: true,
        recommendation: true,
        summary: true,
        metrics: { select: { testResultId: true, metricKey: true } },
      },
    });
    if (!record) {
      return null;
    }

    const metrics = await this.resolveMetrics(
      record.metrics.map((m) => ({
        testResultId: m.testResultId,
        metricKey: m.metricKey,
      })),
    );

    return {
      recordId: record.id,
      outcome: record.outcome,
      recommendation: record.recommendation,
      counselorSummary: record.summary,
      metrics,
    };
  }

  /**
   * Resolves discussed (testResultId, metricKey) refs into display metrics by
   * reading each TestResult's metrics JSON. Sorted by metricKey asc for
   * determinism. Unresolved metrics still surface (key only) so the summary
   * never silently drops a discussed metric.
   */
  private async resolveMetrics(
    refs: { testResultId: string; metricKey: string }[],
  ): Promise<SummaryMetricInput[]> {
    if (refs.length === 0) {
      return [];
    }

    const testResultIds = [...new Set(refs.map((r) => r.testResultId))];
    const testResults = await this.prisma.testResult.findMany({
      where: { id: { in: testResultIds } },
      select: { id: true, metrics: true },
    });

    const metricsByResult = new Map(
      testResults.map((tr) => [
        tr.id,
        this.indexMetrics(tr.metrics),
      ]),
    );

    const resolved = refs.map((ref) => {
      const indexed = metricsByResult.get(ref.testResultId);
      const detail = indexed?.get(ref.metricKey);
      return {
        metricKey: ref.metricKey,
        label: detail?.label ?? null,
        value: detail?.value ?? null,
        unit: detail?.unit ?? null,
        status: detail?.status ?? null,
      };
    });

    return resolved.sort((a, b) => a.metricKey.localeCompare(b.metricKey));
  }

  /**
   * Indexes a raw `TestResult.metrics` JSON value by metricKey. Mirrors the
   * defensive normalization in ConsultationService.normalizeMetrics (array of
   * metric objects; flat key→value object fallback).
   */
  private indexMetrics(
    raw: unknown,
  ): Map<string, Omit<SummaryMetricInput, 'metricKey'>> {
    const index = new Map<string, Omit<SummaryMetricInput, 'metricKey'>>();

    const toValue = (v: unknown): number | string | null =>
      typeof v === 'number' || typeof v === 'string' ? v : null;
    const toText = (v: unknown): string | null =>
      typeof v === 'string' ? v : null;

    if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (typeof entry !== 'object' || entry === null) {
          continue;
        }
        const m = entry as Record<string, unknown>;
        const metricKey = typeof m.metricKey === 'string' ? m.metricKey : null;
        if (!metricKey) {
          continue;
        }
        index.set(metricKey, {
          label: toText(m.label),
          value: toValue(m.value),
          unit: toText(m.unit),
          status: toText(m.status),
        });
      }
      return index;
    }

    if (raw && typeof raw === 'object') {
      for (const [metricKey, v] of Object.entries(
        raw as Record<string, unknown>,
      )) {
        index.set(metricKey, {
          label: null,
          value: toValue(v),
          unit: null,
          status: null,
        });
      }
    }

    return index;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }
}
