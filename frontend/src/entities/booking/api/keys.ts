/** Query-key factory for the booking slice. */
export const bookingKeys = {
  myBookings: ['myBookings'] as const,
  availabilityCalendar: ['availabilityCalendar'] as const,
  slots: (counselorId: string) => ['slots', counselorId] as const,
};
