import { useQuery } from '@tanstack/react-query';
import { consultationBriefKeys } from './keys';
import { getBookingBrief } from './index';
import type { BookingBrief } from '../types';

/**
 * Loads a booking's pre-consultation brief. `enabled` gates the fetch so the
 * GET (which marks `briefOpenedAt` server-side) only fires when the counselor
 * actually opens the panel — never eagerly for every row. The brief is a stable
 * projection of existing data, so a long staleTime avoids re-stamping churn.
 */
export function useBookingBrief(bookingId: string, enabled: boolean) {
  return useQuery<BookingBrief>({
    queryKey: consultationBriefKeys.brief(bookingId),
    queryFn: () => getBookingBrief(bookingId),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
