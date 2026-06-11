import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { scheduleKeys } from '@/entities/schedule';
import { consultationRecordKeys, invalidateAfterConsultationRecordSaved } from './invalidation';

describe('consultation record invalidation helpers', () => {
  it('refreshes records and schedule after saving a consultation record', async () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    await invalidateAfterConsultationRecordSaved(queryClient);

    expect(spy).toHaveBeenCalledWith({ queryKey: scheduleKeys.counselorSchedule });
    expect(spy).toHaveBeenCalledWith({ queryKey: consultationRecordKeys.counselorRecords });
  });
});
