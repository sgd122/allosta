import type { QueryClient } from '@tanstack/react-query';
import { scheduleKeys } from '@/entities/schedule';
import { consultationRecordKeys } from './keys';

export { consultationRecordKeys } from './keys';

export async function invalidateAfterConsultationRecordSaved(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: scheduleKeys.counselorSchedule }),
    queryClient.invalidateQueries({ queryKey: consultationRecordKeys.counselorRecords }),
  ]);
}
