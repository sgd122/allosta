import type { WaitlistStatus } from '@/shared/config';

export interface MyWaitlistEntry {
  id: string;
  counselorId: string;
  status: WaitlistStatus;
  offeredSlotId: string | null;
  offerExpiresAt: string | null;
  offeredSlot: { id: string; startAt: string; endAt: string } | null;
  createdAt: string;
}
