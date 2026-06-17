import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  QaFeedback,
  QaMessage,
  QaMessageRole,
  QaMessageSource,
  QaSession,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/ownership/ownership.service';
import { OllamaQaGenerator } from './ollama.qa';
import { TemplateQaGenerator } from './template.qa';
import { QaAnswer, QaAnswerInput, QaHistoryTurn } from './qa-answer.interface';
import { normalizeQaMetrics } from './metric-normalize';
import { classifyScope, violatesAnswerGuardrail } from './scope';

/** A session with its message thread (newest-last), returned to the customer. */
export type QaSessionWithMessages = QaSession & { messages: QaMessage[] };

/** The ASSISTANT turn returned after a question, plus the escalation flag. */
export type QaAskResult = QaMessage & {
  /** True only for QUESTION-side out-of-scope declines → show booking CTA. */
  escalate: boolean;
};

/**
 * Customer-facing AI Q&A on test results (ADR 0018).
 *
 * Interpretation-only, grounded on the customer's own metrics, with the local
 * Ollama LLM on the synchronous critical path and a deterministic template
 * fallback. Mirrors the GuidanceService fail-soft philosophy but for an
 * interactive request: any LLM throw/timeout/saturation/guardrail-trip degrades
 * to the template, so the customer never sees an error or an infinite spinner.
 *
 * Safety boundary (separated from deflection boundary):
 *  - QUESTION out-of-scope  → decline + disclaimer + booking CTA (escalate).
 *  - in-scope ANSWER guardrail trip → deterministic template interpretation
 *    (FALLBACK_GUARDRAIL), NOT a refusal — keeps safety AND deflection.
 */
@Injectable()
export class QaService {
  private readonly logger = new Logger(QaService.name);

  /**
   * In-flight cap for the single local LLM. abort() cancels only the fetch (the
   * Ollama server keeps working, ADR limitation), so a counter — not the
   * timeout — is what prevents request pile-up. Over the cap → immediate
   * deterministic template (FALLBACK_SATURATED), no probe, no LLM call.
   */
  private inFlight = 0;
  private readonly maxInFlight: number;

  /**
   * Most recent turns fed to the LLM for follow-up context (AC2). Bounded so the
   * prompt — and thus the latency on the synchronous chat path — stays small as a
   * thread grows. 8 turns ≈ the last 4 exchanges.
   */
  private static readonly MAX_HISTORY_TURNS = 8;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly ollama: OllamaQaGenerator,
    private readonly template: TemplateQaGenerator,
  ) {
    const parsed = Number(process.env.QA_LLM_MAX_INFLIGHT);
    this.maxInFlight = Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
  }

  /**
   * Opens a session scoped to one test report (AC1). Loads the report's subject
   * snapshot and re-verifies ownership (self or ACCEPTED family) before creating
   * the session, mirroring GET /test-results scoping (AC11).
   */
  async createSession(
    customerId: string,
    testResultId: string,
  ): Promise<QaSession> {
    const testResult = await this.prisma.testResult.findUnique({
      where: { id: testResultId },
      select: { subjectType: true, subjectId: true },
    });
    if (!testResult) {
      throw new NotFoundException('Test result not found');
    }

    await this.ownership.assertSubjectOwnedByCustomer(
      customerId,
      testResult.subjectType,
      testResult.subjectId,
    );

    return this.prisma.qaSession.create({
      data: {
        customerId,
        subjectType: testResult.subjectType,
        subjectId: testResult.subjectId,
        testResultId,
      },
    });
  }

  /** Lists the customer's own sessions with their threads (AC9). */
  async findMySessions(customerId: string): Promise<QaSessionWithMessages[]> {
    return this.prisma.qaSession.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: { messages: { orderBy: { seq: 'asc' } } },
    });
  }

  /** Returns one of the customer's own sessions with its thread (AC9/IDOR). */
  async findSession(
    customerId: string,
    sessionId: string,
  ): Promise<QaSessionWithMessages> {
    const session = await this.loadOwnedSession(customerId, sessionId);
    const messages = await this.prisma.qaMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { seq: 'asc' },
    });
    return { ...session, messages };
  }

  /**
   * Answers a free-text question within a session (AC2/3/4/5/6). Persists the
   * USER + ASSISTANT turns atomically (no orphan USER row on LLM failure).
   */
  async ask(
    customerId: string,
    sessionId: string,
    question: string,
  ): Promise<QaAskResult> {
    const session = await this.loadOwnedSession(customerId, sessionId);

    // QUESTION-side guardrail (Decision B1, layer 2). Out-of-scope → decline +
    // escalate; never call the LLM.
    const inScope = classifyScope(question);
    if (!inScope) {
      this.logger.log(
        `qa.ask session=${session.id} inScope=false source=${QaMessageSource.FALLBACK_GUARDRAIL}`,
      );
      const assistant = await this.persistTurn(session.id, question, false, {
        text: this.declineText(),
        groundedMetricRefs: [],
        source: QaMessageSource.FALLBACK_GUARDRAIL,
      });
      return { ...assistant, escalate: true };
    }

    const indicators = await this.loadIndicators(session.testResultId);
    // Prior turns give the LLM follow-up context (AC2 multi-turn). Loaded before
    // the current USER/ASSISTANT rows are persisted, so it excludes this question.
    const history = await this.loadHistory(session.id);
    const answer = await this.resolveAnswer({ question, indicators, history });

    this.logger.log(
      `qa.ask session=${session.id} inScope=true source=${answer.source} grounded=${answer.groundedMetricRefs.length}`,
    );

    const assistant = await this.persistTurn(session.id, question, true, answer);
    return { ...assistant, escalate: false };
  }

  /** Records YES/NO feedback on one of the customer's own ASSISTANT turns (AC7). */
  async submitFeedback(
    customerId: string,
    messageId: string,
    feedback: QaFeedback,
  ): Promise<QaMessage> {
    const message = await this.prisma.qaMessage.findUnique({
      where: { id: messageId },
      include: { session: { select: { customerId: true } } },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    // IDOR guard: the message's session must belong to the caller.
    if (message.session.customerId !== customerId) {
      throw new ForbiddenException('Message does not belong to the customer');
    }
    if (message.role !== QaMessageRole.ASSISTANT) {
      throw new ForbiddenException('Only assistant answers can be rated');
    }

    return this.prisma.qaMessage.update({
      where: { id: messageId },
      data: { feedback },
    });
  }

  // ── internals ────────────────────────────────────────────────────────────

  /**
   * Resolves the answer for an in-scope question: in-flight cap → LLM (short
   * timeout) → answer-side guardrail → deterministic template on any failure.
   * Never throws.
   */
  private async resolveAnswer(
    input: QaAnswerInput,
  ): Promise<QaAnswer & { source: QaMessageSource }> {
    // Saturated: immediate deterministic template, no probe, no LLM call.
    if (this.inFlight >= this.maxInFlight) {
      const fallback = await this.template.generate(input);
      return { ...fallback, source: QaMessageSource.FALLBACK_SATURATED };
    }

    this.inFlight += 1;
    try {
      const llm = await this.ollama.generate(input);
      // ANSWER-side guardrail (Decision B1): drift into advice → template
      // interpretation (FALLBACK_GUARDRAIL), NOT a refusal.
      if (violatesAnswerGuardrail(llm.text)) {
        const fallback = await this.template.generate(input);
        return { ...fallback, source: QaMessageSource.FALLBACK_GUARDRAIL };
      }
      return { ...llm, source: QaMessageSource.LLM };
    } catch (error: unknown) {
      const source = this.isAbort(error)
        ? QaMessageSource.FALLBACK_TIMEOUT
        : QaMessageSource.FALLBACK_UNAVAILABLE;
      const fallback = await this.template.generate(input);
      return { ...fallback, source };
    } finally {
      this.inFlight -= 1;
    }
  }

  /**
   * Persists the USER question and the ASSISTANT answer in one transaction so a
   * mid-flight failure never leaves an orphan USER row. Returns the ASSISTANT row.
   */
  private async persistTurn(
    sessionId: string,
    question: string,
    inScope: boolean,
    answer: { text: string; groundedMetricRefs: string[]; source: QaMessageSource },
  ): Promise<QaMessage> {
    return this.prisma.$transaction(async (tx) => {
      await tx.qaMessage.create({
        data: {
          sessionId,
          role: QaMessageRole.USER,
          text: question,
          inScope,
        },
      });
      return tx.qaMessage.create({
        data: {
          sessionId,
          role: QaMessageRole.ASSISTANT,
          text: answer.text,
          source: answer.source,
          groundedMetricRefs: answer.groundedMetricRefs,
        },
      });
    });
  }

  /**
   * Loads a session and enforces both authorization layers on every read/ask
   * (404 if missing, 403 otherwise):
   *  1. caller ownership — the session must belong to the asker (IDOR guard);
   *  2. live subject consent — the asker must STILL own (self) or have an
   *     ACCEPTED family link to the session's subject. createSession checks this
   *     once, but a FamilyLink revoked afterwards must immediately cut off access
   *     to the subject's metrics (loaded in ask via loadIndicators). Re-checking
   *     here mirrors the booking/test-result paths: live, no caching (AC11).
   */
  private async loadOwnedSession(
    customerId: string,
    sessionId: string,
  ): Promise<QaSession> {
    const session = await this.prisma.qaSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException('Q&A session not found');
    }
    if (session.customerId !== customerId) {
      throw new ForbiddenException('Session does not belong to the customer');
    }
    await this.ownership.assertSubjectOwnedByCustomer(
      customerId,
      session.subjectType,
      session.subjectId,
    );
    return session;
  }

  /** Loads + normalizes the grounded indicators for the session's report. */
  private async loadIndicators(testResultId: string | null) {
    if (!testResultId) {
      return [];
    }
    const testResult = await this.prisma.testResult.findUnique({
      where: { id: testResultId },
      select: { metrics: true },
    });
    return testResult ? normalizeQaMetrics(testResult.metrics) : [];
  }

  /**
   * Loads the session's prior turns (oldest-first) as plain role/text pairs for
   * LLM follow-up context, capped at the most recent MAX_HISTORY_TURNS turns.
   */
  private async loadHistory(sessionId: string): Promise<QaHistoryTurn[]> {
    const messages = await this.prisma.qaMessage.findMany({
      where: { sessionId },
      orderBy: { seq: 'asc' },
      select: { role: true, text: true },
    });
    return messages
      .slice(-QaService.MAX_HISTORY_TURNS)
      .map((m) => ({ role: m.role, text: m.text }));
  }

  private isAbort(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    );
  }

  private declineText(): string {
    return [
      '죄송하지만 이 질문은 검사 수치 "해석" 범위를 벗어나요.',
      '진단·치료·복용·식단·영양제 관련 안내는 드릴 수 없어요.',
      '정확한 상담이 필요하시면 아래에서 상담을 예약해 주세요.',
    ].join(' ');
  }

  /** Surfaced so tests can assert the saturation threshold deterministically. */
  get maxConcurrentLlm(): number {
    return this.maxInFlight;
  }
}
