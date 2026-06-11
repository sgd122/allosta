import { pfetch } from '@/shared/api';
import type { TestResult, SubjectTestResultDto } from '../types';

export async function getTestResults(): Promise<TestResult[]> {
  return pfetch<TestResult[]>('test-results');
}

export async function getBookingTestResults(bookingId: string): Promise<SubjectTestResultDto[]> {
  return pfetch<SubjectTestResultDto[]>(`counselor/bookings/${bookingId}/test-results`);
}
