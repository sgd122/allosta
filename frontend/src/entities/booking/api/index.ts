import { pfetch } from '@/shared/api';
import type { BookingStatus } from '@/shared/config';
import type { Booking, CreateBookingInput, Slot, MyBooking, CalendarDay } from '../types';

export async function getSlots(counselorId: string): Promise<Slot[]> {
  return pfetch<Slot[]>(`counselors/${counselorId}/slots`);
}

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  return pfetch<Booking>('bookings', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function cancelBooking(bookingId: string): Promise<void> {
  return pfetch<void>(`bookings/${bookingId}`, { method: 'DELETE' });
}

export async function getMyBookings(): Promise<MyBooking[]> {
  return pfetch<MyBooking[]>('bookings');
}

export async function confirmBooking(bookingId: string): Promise<Booking> {
  return pfetch<Booking>(`bookings/${bookingId}/confirm`, { method: 'PATCH' });
}

export async function getAvailabilityCalendar(): Promise<CalendarDay[]> {
  return pfetch<CalendarDay[]>('counselors/availability-calendar');
}

export async function setAttendance(
  bookingId: string,
  status: Extract<BookingStatus, 'NO_SHOW' | 'COMPLETED'>,
): Promise<Booking> {
  return pfetch<Booking>(`bookings/${bookingId}/attendance`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
