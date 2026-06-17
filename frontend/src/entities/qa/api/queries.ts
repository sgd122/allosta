import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qaKeys } from './keys';
import {
  askQuestion,
  createQaSession,
  getQaSession,
  getQaSessions,
  submitFeedback,
} from './index';
import type { QaFeedback } from '../types';

/** One session thread; disabled until a session exists. */
export function useQaSession(sessionId: string | null) {
  return useQuery({
    queryKey: qaKeys.session(sessionId ?? 'none'),
    queryFn: () => getQaSession(sessionId as string),
    enabled: sessionId !== null,
  });
}

/** The customer's own Q&A session list. */
export function useQaSessions() {
  return useQuery({
    queryKey: qaKeys.sessions,
    queryFn: getQaSessions,
  });
}

/**
 * Opens a Q&A session, then refreshes the session list. The session id is only
 * known after this resolves, so the lazy-create flow awaits `mutateAsync` and
 * feeds the id to `useAskQuestionMutation` per call (sessionId is a mutate var,
 * not a hook arg) — keeping the whole flow on slice hooks (ADR 0011).
 */
export function useCreateQaSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (testResultId: string) => createQaSession(testResultId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qaKeys.sessions });
    },
  });
}

/**
 * Asks a question; refreshes that session's thread on success. `sessionId` is a
 * mutate variable (not a hook arg) so a freshly lazy-created session can be used
 * in the same handler without rebuilding the hook.
 */
export function useAskQuestionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { sessionId: string; question: string }) =>
      askQuestion(vars.sessionId, vars.question),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: qaKeys.session(vars.sessionId),
      });
    },
  });
}

/** Submits answer feedback; refreshes the session thread on success. */
export function useSubmitFeedbackMutation(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { messageId: string; feedback: QaFeedback }) =>
      submitFeedback(vars.messageId, vars.feedback),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: qaKeys.session(sessionId),
      });
    },
  });
}

export { qaKeys } from './keys';
