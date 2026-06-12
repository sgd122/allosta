/** Query-key factory for the consultation-brief slice. */
export const consultationBriefKeys = {
  /** One booking's assembled brief. */
  brief: (bookingId: string) => ['consultation-brief', bookingId] as const,
};
