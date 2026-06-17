/** Query-key factory for the qa slice. */
export const qaKeys = {
  sessions: ['qa-sessions'] as const,
  session: (sessionId: string) => ['qa-session', sessionId] as const,
};
