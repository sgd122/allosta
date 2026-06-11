/** Query-key factory for the test-result slice. */
export const testResultKeys = {
  list: ['testResults'] as const,
  byBooking: (bookingId: string) => ['booking-test-results', bookingId] as const,
};
