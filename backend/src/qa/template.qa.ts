import { Injectable } from '@nestjs/common';
import {
  QaAnswer,
  QaAnswerGenerator,
  QaAnswerInput,
  QaMetricInput,
} from './qa-answer.interface';

/**
 * Deterministic Korean interpretation generator (ADR 0018 FALLBACK + safety
 * floor). `available()` is always true and `generate()` is pure: the SAME input
 * ALWAYS yields the SAME output (unit-tested). No I/O, no clock, no randomness.
 *
 * Serves two roles:
 *  - AC4 fail-soft fallback when Ollama is unavailable/times out/saturated.
 *  - Safety fallback when an in-scope LLM answer trips the guardrail
 *    (FALLBACK_GUARDRAIL) — a safe interpretation, never advice.
 *
 * It states what each indicator measures, the customer's own value/reference
 * range/status, and a closing reminder that this is interpretation only.
 */
@Injectable()
export class TemplateQaGenerator implements QaAnswerGenerator {
  async available(): Promise<boolean> {
    return true;
  }

  async generate(input: QaAnswerInput): Promise<QaAnswer> {
    const groundedMetricRefs = input.indicators.map((m) => m.metricKey);

    if (input.indicators.length === 0) {
      return {
        text: '이 검사 리포트에는 표시할 지표 정보가 없어요. 자세한 내용은 상담을 통해 확인하시는 것을 권해드려요. (이 안내는 수치 해석일 뿐, 진단이나 처방이 아니에요.)',
        groundedMetricRefs,
      };
    }

    const lines: string[] = ['검사 지표 해석이에요.', ''];
    for (const metric of input.indicators) {
      lines.push(`- ${this.formatIndicator(metric)}`);
    }
    lines.push(
      '',
      '위 내용은 수치에 대한 해석일 뿐 진단이나 처방이 아니에요. 더 자세한 상담이 필요하시면 상담 예약을 권해드려요.',
    );

    return { text: lines.join('\n'), groundedMetricRefs };
  }

  private formatIndicator(metric: QaMetricInput): string {
    const name = metric.label ?? metric.metricKey;
    const value =
      metric.value === null
        ? '측정값 없음'
        : `${metric.value}${metric.unit ? ` ${metric.unit}` : ''}`;
    const range = metric.referenceRange
      ? ` (참조범위 ${metric.referenceRange})`
      : '';
    const status = metric.status
      ? ` — 현재 '${metric.status}' 상태로 보여요`
      : '';
    return `${name}: ${value}${range}${status}.`;
  }
}
