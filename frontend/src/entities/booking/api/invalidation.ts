import type { QueryClient } from '@tanstack/react-query';
import { scheduleKeys } from '@/entities/schedule';
import { bookingKeys } from './keys';

export async function invalidateAfterBookingCreated(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: bookingKeys.availabilityCalendar }),
    queryClient.invalidateQueries({ queryKey: bookingKeys.myBookings }),
  ]);
}

export async function invalidateAfterBookingCancelled(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: bookingKeys.myBookings }),
    queryClient.invalidateQueries({ queryKey: bookingKeys.availabilityCalendar }),
  ]);
}

export async function invalidateAfterBookingUpdatedByCounselor(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: scheduleKeys.counselorSchedule });
}
