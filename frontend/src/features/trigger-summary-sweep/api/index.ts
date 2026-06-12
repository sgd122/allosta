import { pfetch } from '@/shared/api';

/** Result of one manual AI-summary upgrade sweep (FALLBACK → UPGRADED). */
export interface SweepResult {
  upgraded: number;
}

/**
 * Triggers one AI-summary upgrade sweep on demand (ADR 0014 demo aid). The
 * OpsScheduler @Interval also runs this automatically; this endpoint lets an
 * admin force a cycle right after `ollama pull gemma3n:e4b` instead of waiting.
 */
export async function triggerSummarySweep(): Promise<SweepResult> {
  return pfetch<SweepResult>('admin/summary/sweep', { method: 'POST' });
}
