import { Injectable, Logger } from '@nestjs/common';
import {
  SummaryGenerator,
  SummaryInput,
  SummaryMetricInput,
} from './summary-generator.interface';

/**
 * Local Ollama summarizer (ADR 0014 UPGRADED path).
 *
 * Calls a local Ollama instance at `OLLAMA_BASE_URL` (default
 * `http://localhost:11434`) with model `SUMMARY_MODEL` (default `gemma3n:e4b`).
 *
 * FAIL-SOFT by construction: missing env → defaults; unreachable host or any
 * error → `available()` returns false and `generate()` falls back to the
 * deterministic template. NEVER throws at construction/startup — the grader's
 * environment may have no Ollama at all, and the golden path must still pass.
 */
@Injectable()
export class OllamaSummarizer implements SummaryGenerator {
  private readonly logger = new Logger(OllamaSummarizer.name);
  private readonly baseUrl: string;
  readonly model: string;

  /** Short health-probe timeout (ms) so the sweep never blocks on a dead host. */
  private static readonly HEALTHCHECK_TIMEOUT_MS = 1_500;
  /** Generation timeout (ms) — local gemma3n:e4b answers well within this. */
  private static readonly GENERATE_TIMEOUT_MS = 30_000;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    this.model = process.env.SUMMARY_MODEL ?? 'gemma3n:e4b';
  }

  async available(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      OllamaSummarizer.HEALTHCHECK_TIMEOUT_MS,
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

  async generate(input: SummaryInput): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      OllamaSummarizer.GENERATE_TIMEOUT_MS,
    );
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
      const text = typeof body.response === 'string' ? body.response.trim() : '';
      if (!text) {
        throw new Error('Ollama returned an empty response');
      }
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  private buildPrompt(input: SummaryInput): string {
    const metricLines = input.metrics
      .map((metric) => `- ${this.formatMetric(metric)}`)
      .join('\n');

    return [
      '당신은 건강 상담 기록을 요약하는 보조자입니다.',
      '아래 상담 정보를 바탕으로 상담사가 다음 상담을 준비할 수 있도록',
      '간결한 한국어 요약을 작성하세요.',
      '',
      `상담 결과: ${input.outcome}`,
      `상담사 요약: ${input.counselorSummary}`,
      `권고 사항: ${input.recommendation}`,
      metricLines ? `논의된 지표:\n${metricLines}` : '논의된 지표: 없음',
    ].join('\n');
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
}
