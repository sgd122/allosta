import { pfetch } from '@/shared/api';
import type { MyWaitlistEntry } from '../types';

export async function getMyWaitlist(): Promise<MyWaitlistEntry[]> {
  return pfetch<MyWaitlistEntry[]>('waitlist');
}
