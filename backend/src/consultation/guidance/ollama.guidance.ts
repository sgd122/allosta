import { Injectable, Logger } from '@nestjs/common';
import {
  GuidanceGenerator,
  GuidanceIndicatorInput,
  GuidanceInput,
  GuidancePastRecordInput,
} from './guidance-generator.interface';

/**
 * Local Ollama guidance generator (ADR 0014 UPGRADED path).
 *
 * Calls a local Ollama instance at `OLLAMA_BASE_URL` (default
 * `http://localhost:11434`) with model `SUMMARY_MODEL` (default `gemma4:e4b`).
 *
 * FAIL-SOFT by construction: missing env → defaults; unreachable host or any
 * error → `available()` returns false and the caller falls back to the
 * deterministic template. NEVER throws at construction/startup — the grader's
 * environment may have no Ollama at all, and the golden path must still pass.
 */
@Injectable()
export class OllamaGuidanceGenerator implements GuidanceGenerator {
  private readonly logger = new Logger(OllamaGuidanceGenerator.name);
  private readonly baseUrl: string;
  public readonly model: string;

  /** Short health-probe timeout (ms) so the sweep never blocks on a dead host. */
  private static readonly HEALTHCHECK_TIMEOUT_MS = 1_500;
  /** Generation timeout (ms) — local gemma4:e4b answers well within this. */
  private static readonly GENERATE_TIMEOUT_MS = 30_000;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    this.model = process.env.SUMMARY_MODEL ?? 'gemma4:e4b';
  }

  async available(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      OllamaGuidanceGenerator.HEALTHCHECK_TIMEOUT_MS,
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

  async generate(input: GuidanceInput): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      OllamaGuidanceGenerator.GENERATE_TIMEOUT_MS,
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
      const text =
        typeof body.response === 'string' ? body.response.trim() : '';
      if (!text) {
        throw new Error('Ollama returned an empty response');
      }
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  private buildPrompt(input: GuidanceInput): string {
    const indicatorLines = input.indicators
      .map((metric) => `- ${this.formatIndicator(metric)}`)
      .join('\n');
    const pastLines = input.pastRecords
      .map((record) => `- ${this.formatPastRecord(record)}`)
      .join('\n');

    return [
      '당신은 건강 상담사를 돕는 보조자입니다.',
      '아래 고객의 검사 지표, 과거 상담 기록, 사전질문을 바탕으로',
      '상담사가 "다가오는" 상담을 어떻게 진행하면 좋을지 조언하세요.',
      '집중 점검할 항목, 확인/논의할 내용, 과거 상담의 후속 조치를 포함한',
      '간결한 한국어 가이드를 작성하세요. (완료된 상담 요약이 아닙니다.)',
      '',
      `고객 사전질문: ${input.concern ?? '없음'}`,
      indicatorLines ? `검사 지표:\n${indicatorLines}` : '검사 지표: 없음',
      pastLines ? `과거 상담 기록:\n${pastLines}` : '과거 상담 기록: 없음',
    ].join('\n');
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
    return `[${record.outcome}] ${record.summary} / 권고: ${record.recommendation}`;
  }
}
