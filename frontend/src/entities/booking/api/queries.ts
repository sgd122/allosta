import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bookingKeys } from './keys';
import {
  invalidateAfterBookingCancelled,
  invalidateAfterBookingCreated,
  invalidateAfterBookingUpdatedByCounselor,
} from './invalidation';
import type { BookingStatus } from '@/shared/config';
import {
  getMyBookings,
  getAvailabilityCalendar,
  getSlots,
  createBooking,
  cancelBooking,
  confirmBooking,
  setAttendance,
} from './index';


/** Current user's own booking list. */
export function useMyBookings() {
  return useQuery({
    queryKey: bookingKeys.myBookings,
    queryFn: getMyBookings,
  });
}

/** Availability calendar for the booking page. */
export function useAvailabilityCalendar() {
  return useQuery({
    queryKey: bookingKeys.availabilityCalendar,
    queryFn: getAvailabilityCalendar,
  });
}

/** Available slots for a specific counselor. */
export function useSlots(counselorId: string) {
  return useQuery({
    queryKey: bookingKeys.slots(counselorId),
    queryFn: () => getSlots(counselorId),
  });
}

/** Cancel a booking; refreshes own bookings, the availability calendar, and the waitlist. */
export function useCancelBookingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) => cancelBooking(bookingId),
    onSuccess: () => {
      void invalidateAfterBookingCancelled(queryClient);
    },
  });
}

/** Create a booking from a slot; refreshes the calendar and own bookings. */
export function useCreateBookingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { slotId: string; testResultId: string }) => createBooking(vars),
    onSuccess: () => {
      void invalidateAfterBookingCreated(queryClient, { source: 'calendar-slot' });
    },
  });
}

/** Counselor confirms a PENDING booking; refreshes the counselor schedule. */
export function useConfirmBookingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) => confirmBooking(bookingId),
    onSuccess: () => {
      void invalidateAfterBookingUpdatedByCounselor(queryClient);
    },
  });
}

/** Counselor sets attendance (NO_SHOW | COMPLETED); refreshes the counselor schedule. */
export function useSetAttendanceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      bookingId,
      status,
    }: {
      bookingId: string;
      status: Extract<BookingStatus, 'NO_SHOW' | 'COMPLETED'>;
    }) => setAttendance(bookingId, status),
    onSuccess: () => {
      void invalidateAfterBookingUpdatedByCounselor(queryClient);
    },
  });
}

export { bookingKeys } from './keys';
