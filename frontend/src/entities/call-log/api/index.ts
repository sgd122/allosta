import { pfetch } from '@/shared/api';
import type { CallLogRecord, LogCallInput } from '../types';

/**
 * POST /counselor/bookings/:bookingId/calls
 * Records one click-to-call attempt as evidence for a possible no-show override.
 * The server validates ownership (same counselor as the brief) and creates the
 * CallLog row. Never writes Booking.status — P5 loose coupling.
 */
export async function logCall(
  bookingId: string,
  input: LogCallInput,
): Promise<CallLogRecord> {
  return pfetch<CallLogRecord>(`counselor/bookings/${bookingId}/calls`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * PATCH /counselor/bookings/:bookingId/calls/:callId
 * Edits a previously logged call so the counselor can fix a mis-clicked outcome
 * or refine the memo. Same ownership boundary as the brief; never writes
 * Booking.status (P5). The receipt omits `note` (write-only containment).
 */
export async function updateCallLog(
  bookingId: string,
  callId: string,
  input: LogCallInput,
): Promise<CallLogRecord> {
  return pfetch<CallLogRecord>(
    `counselor/bookings/${bookingId}/calls/${callId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}

/**
 * DELETE /counselor/bookings/:bookingId/calls/:callId
 * Removes a logged call entry. Same ownership boundary as edit; never writes
 * Booking.status (P5). Analytics recompute live on read — no backfill needed.
 */
export async function deleteCallLog(
  bookingId: string,
  callId: string,
): Promise<void> {
  await pfetch<void>(`counselor/bookings/${bookingId}/calls/${callId}`, {
    method: 'DELETE',
  });
}
