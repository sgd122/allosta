import type { QueryClient } from '@tanstack/react-query';
import { scheduleKeys } from '@/entities/schedule';
import { waitlistKeys } from '@/entities/waitlist';
import { bookingKeys } from './keys';

export type BookingCreatedSource = 'calendar-slot' | 'waitlist-offer';

export async function invalidateAfterBookingCreated(
  queryClient: QueryClient,
  options: { source: BookingCreatedSource },
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: bookingKeys.availabilityCalendar }),
    queryClient.invalidateQueries({ queryKey: bookingKeys.myBookings }),
    ...(options.source === 'waitlist-offer'
      ? [queryClient.invalidateQueries({ queryKey: waitlistKeys.myWaitlist })]
      : []),
  ]);
}

export async function invalidateAfterBookingCancelled(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: bookingKeys.myBookings }),
    queryClient.invalidateQueries({ queryKey: bookingKeys.availabilityCalendar }),
    queryClient.invalidateQueries({ queryKey: waitlistKeys.myWaitlist }),
  ]);
}

export async function invalidateAfterBookingUpdatedByCounselor(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: scheduleKeys.counselorSchedule });
}
