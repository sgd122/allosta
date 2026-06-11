import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  invalidateAfterBookingCancelled,
  invalidateAfterBookingCreated,
  invalidateAfterBookingUpdatedByCounselor,
} from './invalidation';
import { bookingKeys } from './queries';
import { scheduleKeys } from '@/entities/schedule';
import { waitlistKeys } from '@/entities/waitlist';

function spiedClient() {
  const queryClient = new QueryClient();
  const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
  return { queryClient, spy };
}

describe('booking invalidation helpers', () => {
  it('centralizes cache refresh after a normal booking is created', async () => {
    const { queryClient, spy } = spiedClient();

    await invalidateAfterBookingCreated(queryClient, { source: 'calendar-slot' });

    expect(spy).toHaveBeenCalledWith({ queryKey: bookingKeys.availabilityCalendar });
    expect(spy).toHaveBeenCalledWith({ queryKey: bookingKeys.myBookings });
    expect(spy).not.toHaveBeenCalledWith({ queryKey: waitlistKeys.myWaitlist });
  });

  it('also refreshes waitlist data after a waitlist offer booking is created', async () => {
    const { queryClient, spy } = spiedClient();

    await invalidateAfterBookingCreated(queryClient, { source: 'waitlist-offer' });

    expect(spy).toHaveBeenCalledWith({ queryKey: waitlistKeys.myWaitlist });
  });

  it('refreshes waitlist data when a booking is cancelled', async () => {
    const { queryClient, spy } = spiedClient();

    await invalidateAfterBookingCancelled(queryClient);

    expect(spy).toHaveBeenCalledWith({ queryKey: bookingKeys.myBookings });
    expect(spy).toHaveBeenCalledWith({ queryKey: bookingKeys.availabilityCalendar });
    expect(spy).toHaveBeenCalledWith({ queryKey: waitlistKeys.myWaitlist });
  });

  it('refreshes counselor schedule after counselor-side booking changes', async () => {
    const { queryClient, spy } = spiedClient();

    await invalidateAfterBookingUpdatedByCounselor(queryClient);

    expect(spy).toHaveBeenCalledWith({ queryKey: scheduleKeys.counselorSchedule });
  });
});
