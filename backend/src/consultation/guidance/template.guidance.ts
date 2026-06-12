import { Injectable } from '@nestjs/common';
import { Outcome } from '@prisma/client';
import {
  GuidanceGenerator,
  GuidanceIndicatorInput,
  GuidanceInput,
  GuidancePastRecordInput,
} from './guidance-generator.interface';

/**
 * Deterministic Korean PREP guidance generator (ADR 0014 FALLBACK default).
 *
 * `available()` is always true and `generate()` is pure: the SAME input ALWAYS
 * yields the SAME output (unit-tested for determinism). No I/O, no clock, no
 * randomness — this is the reproducibility floor that keeps the golden path
 * green without Ollama. The output advises the counselor how to conduct the
 * UPCOMING consultation: focus areas (abnormal indicators), follow-ups carried
 * forward from past sessions, and the customer's concern.
 */
@Injectable()
export class TemplateGuidanceGenerator implements GuidanceGenerator {
  async available(): Promise<boolean> {
    return true;
  }

  async generate(input: GuidanceInput): Promise<string> {
    const lines: string[] = ['다가오는 상담 진행 가이드'];

    if (input.concern) {
      lines.push('', `고객 사전질문: ${input.concern}`);
    }

    const abnormal = input.indicators.filter((m) =>
      TemplateGuidanceGenerator.isAbnormal(m.status),
    );
    if (abnormal.length > 0) {
      lines.push('', '집중 점검 지표 (참조범위 이탈):');
      for (const metric of abnormal) {
        lines.push(`- ${this.formatIndicator(metric)}`);
      }
    } else if (input.indicators.length > 0) {
      lines.push('', '참조범위 이탈 지표 없음 — 전반적 검사 결과를 확인하세요.');
    }

    if (input.pastRecords.length > 0) {
      lines.push('', '과거 상담 후속 사항:');
      for (const record of input.pastRecords) {
        lines.push(`- ${this.formatPastRecord(record)}`);
      }
    } else {
      lines.push('', '과거 상담 기록 없음 — 첫 상담 기준으로 진행하세요.');
    }

    return lines.join('\n');
  }

  /**
   * Treats a metric as abnormal when it carries a status that is neither empty
   * nor an explicit normal marker. Mirrors the BioCom 판정 convention where an
   * out-of-range indicator is tagged (e.g. "LOW"/"HIGH"/"주의") while in-range
   * ones are "NORMAL"/"정상". Deterministic and case-insensitive.
   */
  private static isAbnormal(status: string | null): boolean {
    if (!status) {
      return false;
    }
    const normalized = status.trim().toLowerCase();
    return !TemplateGuidanceGenerator.NORMAL_STATUSES.has(normalized);
  }

  private formatIndicator(metric: GuidanceIndicatorInput): string {
    const name = metric.label ?? metric.metricKey;
    const value =
      metric.value === null
        ? '측정값 없음'
        : `${metric.value}${metric.unit ? ` ${metric.unit}` : ''}`;
    const status = metric.status ? ` (${metric.status})` : '';
    return `${name}: ${value}${status}`;
  }

  private formatPastRecord(record: GuidancePastRecordInput): string {
    const outcomeLabel = TemplateGuidanceGenerator.OUTCOME_LABELS[record.outcome];
    return `[${outcomeLabel}] ${record.recommendation}`;
  }

  private static readonly NORMAL_STATUSES = new Set<string>([
    'normal',
    '정상',
    'ok',
  ]);

  private static readonly OUTCOME_LABELS: Record<Outcome, string> = {
    [Outcome.EXPLAINED]: '설명 완료',
    [Outcome.GUIDED]: '생활 가이드 제공',
    [Outcome.PURCHASED]: '제품 구매 연계',
  };
}
