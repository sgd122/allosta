import { useMutation, useQueryClient } from '@tanstack/react-query';
import { consultationBriefKeys } from '@/entities/consultation-brief';
import { logCall, updateCallLog, deleteCallLog } from './index';
import type { LogCallInput } from '../types';

/**
 * Mutation hook for POST /counselor/bookings/:bookingId/calls.
 * Caller supplies the bookingId via variables so the same hook instance
 * is reusable across bookings in the same session. On success it invalidates
 * the booking's brief query so the rendered call-log list refreshes.
 */
export function useLogCallMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      bookingId,
      input,
    }: {
      bookingId: string;
      input: LogCallInput;
    }) => logCall(bookingId, input),
    onSuccess: (_data, { bookingId }) => {
      void queryClient.invalidateQueries({
        queryKey: consultationBriefKeys.brief(bookingId),
      });
    },
  });
}

/**
 * Mutation hook for PATCH /counselor/bookings/:bookingId/calls/:callId.
 * Edits a logged call (corrected outcome / refined note). On success it
 * invalidates the booking's brief query so the call-log list reflects the edit.
 */
export function useUpdateCallLogMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      bookingId,
      callId,
      input,
    }: {
      bookingId: string;
      callId: string;
      input: LogCallInput;
    }) => updateCallLog(bookingId, callId, input),
    onSuccess: (_data, { bookingId }) => {
      void queryClient.invalidateQueries({
        queryKey: consultationBriefKeys.brief(bookingId),
      });
    },
  });
}

/**
 * Mutation hook for DELETE /counselor/bookings/:bookingId/calls/:callId.
 * Removes a logged call entry. On success it invalidates the booking's brief
 * query so the call-log list reflects the deletion.
 */
export function useDeleteCallLogMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      bookingId,
      callId,
    }: {
      bookingId: string;
      callId: string;
    }) => deleteCallLog(bookingId, callId),
    onSuccess: (_data, { bookingId }) => {
      void queryClient.invalidateQueries({
        queryKey: consultationBriefKeys.brief(bookingId),
      });
    },
  });
}
