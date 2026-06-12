import { useMutation, useQueryClient } from '@tanstack/react-query';
import { analyticsKeys } from '@/entities/analytics';
import { triggerSummarySweep, type SweepResult } from './index';

/**
 * Runs one AI-summary upgrade sweep. On success it invalidates the admin
 * analytics summary so the UPGRADED ratio on the dashboard reflects any rows
 * the sweep just promoted.
 */
export function useTriggerSummarySweepMutation(onSuccess?: (result: SweepResult) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerSummarySweep,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: analyticsKeys.summary });
      onSuccess?.(result);
    },
  });
}
