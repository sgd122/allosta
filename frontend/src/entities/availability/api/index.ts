import { pfetch } from '@/shared/api';
import type { AvailabilitySlot } from '../types';

export async function getMyCounselorSlots(): Promise<AvailabilitySlot[]> {
  return pfetch<AvailabilitySlot[]>('counselors/slots');
}

export async function createCounselorSlots(
  slots: { startAt: string; endAt: string }[],
): Promise<AvailabilitySlot[]> {
  return pfetch<AvailabilitySlot[]>('counselors/slots', {
    method: 'POST',
    body: JSON.stringify({ slots }),
  });
}

export async function updateCounselorSlot(
  slotId: string,
  dto: { isOpen?: boolean; startAt?: string; endAt?: string },
): Promise<AvailabilitySlot> {
  return pfetch<AvailabilitySlot>(`slots/${slotId}`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

export async function deleteCounselorSlot(slotId: string): Promise<AvailabilitySlot> {
  return pfetch<AvailabilitySlot>(`slots/${slotId}`, { method: 'DELETE' });
}
