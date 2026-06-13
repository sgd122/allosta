/**
 * Call attempt outcome enum — mirrors Prisma CallOutcome (ADR 0016).
 * Structured enum (never free text) so attempts are aggregatable
 * without reading the note.
 */
export type CallOutcome = 'CONNECTED' | 'NO_ANSWER' | 'INVALID';

/** Request body for POST /counselor/bookings/:bookingId/calls */
export interface LogCallInput {
  outcome: CallOutcome;
  /** Optional short memo, max 1000 chars. Never logged or aggregated. */
  note?: string;
}

/**
 * CallLog creation receipt returned from the server (ADR 0016).
 * `note` is intentionally NOT echoed back — it is write-only, PII-adjacent
 * evidence (containment). The counselor already holds the note they submitted.
 */
export interface CallLogRecord {
  id: string;
  bookingId: string;
  counselorId: string;
  outcome: CallOutcome;
  createdAt: string;
}
