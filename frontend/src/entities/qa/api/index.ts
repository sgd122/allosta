import { pfetch } from '@/shared/api';
import type {
  QaAskResult,
  QaFeedback,
  QaMessage,
  QaSession,
  QaSessionWithMessages,
} from '../types';

/** Opens a Q&A session scoped to one test report (AC1). */
export async function createQaSession(testResultId: string): Promise<QaSession> {
  return pfetch<QaSession>('qa/sessions', {
    method: 'POST',
    body: JSON.stringify({ testResultId }),
  });
}

/** Asks a free-text question in a session and returns the answer turn (AC2). */
export async function askQuestion(
  sessionId: string,
  question: string,
): Promise<QaAskResult> {
  return pfetch<QaAskResult>(`qa/sessions/${sessionId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}

/** Lists the current customer's own Q&A sessions with threads (AC9). */
export async function getQaSessions(): Promise<QaSessionWithMessages[]> {
  return pfetch<QaSessionWithMessages[]>('qa/sessions');
}

/** Loads one of the customer's own session threads (AC9). */
export async function getQaSession(
  sessionId: string,
): Promise<QaSessionWithMessages> {
  return pfetch<QaSessionWithMessages>(`qa/sessions/${sessionId}`);
}

/** Records YES/NO feedback on an assistant answer (AC7). */
export async function submitFeedback(
  messageId: string,
  feedback: QaFeedback,
): Promise<QaMessage> {
  return pfetch<QaMessage>(`qa/messages/${messageId}/feedback`, {
    method: 'PATCH',
    body: JSON.stringify({ feedback }),
  });
}
