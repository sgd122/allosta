import { Injectable } from '@nestjs/common';
import { Outcome } from '@prisma/client';
import {
  SummaryGenerator,
  SummaryInput,
  SummaryMetricInput,
} from './summary-generator.interface';

/**
 * Deterministic Korean template summarizer (ADR 0014 FALLBACK default).
 *
 * `available()` is always true and `generate()` is pure: the SAME input ALWAYS
 * yields the SAME output (unit-tested for determinism). No I/O, no clock, no
 * randomness — this is the reproducibility floor that keeps the golden path
 * green without Ollama.
 */
@Injectable()
export class TemplateSummarizer implements SummaryGenerator {
  async available(): Promise<boolean> {
    return true;
  }

  async generate(input: SummaryInput): Promise<string> {
    const outcomeLabel = TemplateSummarizer.OUTCOME_LABELS[input.outcome];

    const lines: string[] = [
      `상담 결과: ${outcomeLabel}`,
      `상담사 요약: ${input.counselorSummary}`,
      `권고 사항: ${input.recommendation}`,
    ];

    if (input.metrics.length > 0) {
      lines.push('논의된 지표:');
      for (const metric of input.metrics) {
        lines.push(`- ${this.formatMetric(metric)}`);
      }
    }

    return lines.join('\n');
  }

  private formatMetric(metric: SummaryMetricInput): string {
    const name = metric.label ?? metric.metricKey;
    const value =
      metric.value === null
        ? '측정값 없음'
        : `${metric.value}${metric.unit ? ` ${metric.unit}` : ''}`;
    const status = metric.status ? ` (${metric.status})` : '';
    return `${name}: ${value}${status}`;
  }

  private static readonly OUTCOME_LABELS: Record<Outcome, string> = {
    [Outcome.EXPLAINED]: '설명 완료',
    [Outcome.GUIDED]: '생활 가이드 제공',
    [Outcome.PURCHASED]: '제품 구매 연계',
  };
}
