import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { consultationRecordKeys } from './keys';
import { invalidateAfterConsultationRecordSaved } from './invalidation';
import type { ConsultationRecordInput, CounselorRecordEntry } from '../types';
import {
  createConsultationRecord,
  getCounselorRecords,
  updateConsultationRecord,
} from './index';


/** All consultation records for the authenticated counselor. */
export function useCounselorRecords() {
  return useQuery({
    queryKey: consultationRecordKeys.counselorRecords,
    queryFn: getCounselorRecords,
  });
}

/**
 * Save a consultation record (create or update).
 * On success, invalidates both the counselor-records list and the
 * counselor-schedule query so the schedule reflects the newly recorded entry.
 */
export function useSaveConsultationRecordMutation(onSuccess: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      recordId,
      input,
    }: {
      recordId: string | null;
      input: ConsultationRecordInput;
    }): Promise<{ id: string }> => {
      if (recordId !== null) {
        const { bookingId: _omit, ...rest } = input;
        return updateConsultationRecord(recordId, rest);
      }
      return createConsultationRecord(input);
    },
    onSuccess: () => {
      void invalidateAfterConsultationRecordSaved(queryClient);
      onSuccess();
    },
  });
}

/**
 * Update an existing consultation record only.
 * On success, invalidates both the counselor-records list and counselor-schedule.
 */
export function useUpdateConsultationRecordMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      recordId,
      input,
    }: {
      recordId: string;
      input: Omit<ConsultationRecordInput, 'bookingId'>;
    }): Promise<{ id: string }> => updateConsultationRecord(recordId, input),
    onSuccess: () => {
      void invalidateAfterConsultationRecordSaved(queryClient);
    },
  });
}

/**
 * Create a new consultation record only.
 * On success, invalidates both the counselor-records list and counselor-schedule.
 */
export function useCreateConsultationRecordMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConsultationRecordInput): Promise<{ id: string }> =>
      createConsultationRecord(input),
    onSuccess: () => {
      void invalidateAfterConsultationRecordSaved(queryClient);
    },
  });
}

export type { CounselorRecordEntry };

export { consultationRecordKeys } from './keys';
