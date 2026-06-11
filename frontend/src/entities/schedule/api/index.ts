import { pfetch } from '@/shared/api';
import type { ScheduleEntry } from '../types';

export async function getSchedule(): Promise<ScheduleEntry[]> {
  return pfetch<ScheduleEntry[]>('counselor/schedule');
}
