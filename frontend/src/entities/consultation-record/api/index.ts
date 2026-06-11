import { pfetch } from '@/shared/api';
import type { ConsultationRecordInput, CounselorRecordEntry } from '../types';

export async function createConsultationRecord(
  input: ConsultationRecordInput,
): Promise<{ id: string }> {
  return pfetch<{ id: string }>('consultation-records', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateConsultationRecord(
  recordId: string,
  input: Omit<ConsultationRecordInput, 'bookingId'>,
): Promise<{ id: string }> {
  return pfetch<{ id: string }>(`consultation-records/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function getCounselorRecords(): Promise<CounselorRecordEntry[]> {
  return pfetch<CounselorRecordEntry[]>('counselor/records');
}
