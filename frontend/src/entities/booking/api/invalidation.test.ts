import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  invalidateAfterBookingCancelled,
  invalidateAfterBookingCreated,
  invalidateAfterBookingUpdatedByCounselor,
} from './invalidation';
import { bookingKeys } from './queries';
import { scheduleKeys } from '@/entities/schedule';

function spiedClient() {
  const queryClient = new QueryClient();
  const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
  return { queryClient, spy };
}

describe('booking invalidation helpers', () => {
  it('centralizes cache refresh after a booking is created', async () => {
    const { queryClient, spy } = spiedClient();

    await invalidateAfterBookingCreated(queryClient);

    expect(spy).toHaveBeenCalledWith({ queryKey: bookingKeys.availabilityCalendar });
    expect(spy).toHaveBeenCalledWith({ queryKey: bookingKeys.myBookings });
  });

  it('refreshes own bookings and the availability calendar when a booking is cancelled', async () => {
    const { queryClient, spy } = spiedClient();

    await invalidateAfterBookingCancelled(queryClient);

    expect(spy).toHaveBeenCalledWith({ queryKey: bookingKeys.myBookings });
    expect(spy).toHaveBeenCalledWith({ queryKey: bookingKeys.availabilityCalendar });
  });

  it('refreshes counselor schedule after counselor-side booking changes', async () => {
    const { queryClient, spy } = spiedClient();

    await invalidateAfterBookingUpdatedByCounselor(queryClient);

    expect(spy).toHaveBeenCalledWith({ queryKey: scheduleKeys.counselorSchedule });
  });
});
