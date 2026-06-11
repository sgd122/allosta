import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AvailabilitySlot } from '../types';
import {
  createCounselorSlots,
  deleteCounselorSlot,
  getMyCounselorSlots,
  updateCounselorSlot,
} from './index';

/**
 * Query-key factory for the availability slice. Centralizing keys here keeps
 * the cache identity consistent between the hooks below and any invalidation
 * done elsewhere.
 */
export const availabilityKeys = {
  counselorSlots: ['counselor-slots'] as const,
};

/** All availability slots for the authenticated counselor. */
export function useCounselorSlots() {
  return useQuery({
    queryKey: availabilityKeys.counselorSlots,
    queryFn: getMyCounselorSlots,
  });
}

/** Toggle or update a single slot; invalidates the slots list on success. */
export function useUpdateCounselorSlotMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      slotId,
      dto,
    }: {
      slotId: string;
      dto: { isOpen?: boolean; startAt?: string; endAt?: string };
    }): Promise<AvailabilitySlot> => updateCounselorSlot(slotId, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: availabilityKeys.counselorSlots });
    },
  });
}

/** Delete a single slot; invalidates the slots list on success. */
export function useDeleteCounselorSlotMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slotId: string): Promise<AvailabilitySlot> => deleteCounselorSlot(slotId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: availabilityKeys.counselorSlots });
    },
  });
}

/** Create one or more new slots; invalidates the slots list on success. */
export function useCreateCounselorSlotsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slots: { startAt: string; endAt: string }[]): Promise<AvailabilitySlot[]> =>
      createCounselorSlots(slots),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: availabilityKeys.counselorSlots });
    },
  });
}
