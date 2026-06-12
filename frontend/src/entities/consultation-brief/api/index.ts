import { pfetch } from '@/shared/api';
import type { BookingBrief } from '../types';

/**
 * Fetches the read-only pre-consultation brief for a booking. The GET is not a
 * pure read: the server stamps `briefOpenedAt` on first open (DB-idempotent),
 * which is exactly why opening the panel must trigger this request.
 */
export async function getBookingBrief(bookingId: string): Promise<BookingBrief> {
  return pfetch<BookingBrief>(`counselor/bookings/${bookingId}/brief`);
}
