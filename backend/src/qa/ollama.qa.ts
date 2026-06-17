import { Injectable, Logger } from '@nestjs/common';
import {
  QaAnswer,
  QaAnswerGenerator,
  QaAnswerInput,
  QaHistoryTurn,
  QaMetricInput,
} from './qa-answer.interface';

/**
 * Local Ollama answer generator for the customer Q&A (ADR 0018). A near-copy of
 * `OllamaGuidanceGenerator` (ADR 0014) fetch mechanics — same `OLLAMA_BASE_URL`/
 * `SUMMARY_MODEL`, AbortController, `stream:false` — but with:
 *   - a NEW interpretation-only Korean system prompt that forbids
 *     diagnosis/treatment/dosing/diet/supplement advice, and
 *   - a NEW, configurable, SHORT timeout `QA_LLM_TIMEOUT_MS` (default 4000ms),
 *     because this call is on the SYNCHRONOUS customer chat path — it must never
 *     hold the customer waiting. The 30s guidance constant is intentionally NOT
 *     reused.
 *
 * FAIL-SOFT by construction: never throws at construction. `generate()` throws
 * on unreachable host / non-200 / timeout / empty, and the QaService maps the
 * throw to a deterministic template answer (FALLBACK_*). NOTE (ADR limitation):
 * abort cancels the fetch only; the Ollama server keeps generating — the
 * in-flight cap in QaService, not abort, is what protects the single local model.
 */
@Injectable()
export class OllamaQaGenerator implements QaAnswerGenerator {
  private readonly logger = new Logger(OllamaQaGenerator.name);
  private readonly baseUrl: string;
  public readonly model: string;
  private readonly timeoutMs: number;

  private static readonly HEALTHCHECK_TIMEOUT_MS = 1_500;
  private static readonly DEFAULT_TIMEOUT_MS = 4_000;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    this.model = process.env.SUMMARY_MODEL ?? 'gemma4:e4b';
    const parsed = Number(process.env.QA_LLM_TIMEOUT_MS);
    this.timeoutMs =
      Number.isFinite(parsed) && parsed > 0
        ? parsed
        : OllamaQaGenerator.DEFAULT_TIMEOUT_MS;
  }

  async available(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      OllamaQaGenerator.HEALTHCHECK_TIMEOUT_MS,
    );
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async generate(input: QaAnswerInput): Promise<QaAnswer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: this.buildPrompt(input),
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama responded with status ${response.status}`);
      }

      const body = (await response.json()) as { response?: unknown };
      const text =
        typeof body.response === 'string' ? body.response.trim() : '';
      if (!text) {
        throw new Error('Ollama returned an empty response');
      }

      return { text, groundedMetricRefs: this.groundedRefs(text, input) };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Computes which input metrics the answer actually references (by label or
   * metricKey), so `groundedMetricRefs` reflects real grounding (AC3). Falls
   * back to all provided metric keys when no explicit mention is found.
   */
  private groundedRefs(answer: string, input: QaAnswerInput): string[] {
    const refs = input.indicators
      .filter(
        (m) =>
          answer.includes(m.metricKey) ||
          (m.label !== null && answer.includes(m.label)),
      )
      .map((m) => m.metricKey);
    return refs.length > 0
      ? refs
      : input.indicators.map((m) => m.metricKey);
  }

  private buildPrompt(input: QaAnswerInput): string {
    const indicatorLines = input.indicators
      .map((metric) => `- ${this.formatIndicator(metric)}`)
      .join('\n');

    const lines = [
      '당신은 고객의 건강검사 결과를 "해석"만 해주는 보조자입니다.',
      '아래 고객 본인의 검사 지표만 근거로, 고객의 질문에 한국어로 간결하게 답하세요.',
      '',
      '엄격한 규칙:',
      '- 지표가 무엇을 의미하는지, 고객의 값/참조범위/상태가 어떤 의미인지 평이하게 설명만 합니다.',
      '- 진단, 치료, 처방, 복용/용량, 식단/음식, 영양제/보충제 조언은 절대 하지 않습니다.',
      '- 위 영역의 질문이면 답하지 말고, 정확한 상담이 필요하다고만 안내하세요.',
      '- 제공된 지표에 없는 수치는 만들어내지 마세요.',
      '- 답변은 의학적 조언이 아니라 수치 해석임을 한 문장으로 덧붙이세요.',
    ];

    const historyLines = this.formatHistory(input.history);
    if (historyLines) {
      lines.push(
        '',
        '아래는 같은 세션의 이전 대화입니다. 후속 질문의 맥락 파악에만 참고하고, 답변 근거는 검사 지표로 한정하세요.',
        historyLines,
      );
    }

    lines.push(
      '',
      `고객 질문: ${input.question}`,
      indicatorLines ? `고객 본인 검사 지표:\n${indicatorLines}` : '검사 지표: 없음',
    );

    return lines.join('\n');
  }

  /** Renders prior turns as labelled lines, or '' when there is no history. */
  private formatHistory(history: QaHistoryTurn[]): string {
    return history
      .map((turn) => `${turn.role === 'USER' ? '고객' : '보조자'}: ${turn.text}`)
      .join('\n');
  }

  private formatIndicator(metric: QaMetricInput): string {
    const name = metric.label ?? metric.metricKey;
    const value =
      metric.value === null
        ? '측정값 없음'
        : `${metric.value}${metric.unit ? ` ${metric.unit}` : ''}`;
    const range = metric.referenceRange
      ? `, 참조범위 ${metric.referenceRange}`
      : '';
    const status = metric.status ? `, 상태 ${metric.status}` : '';
    return `${name}: ${value}${range}${status}`;
  }
}
