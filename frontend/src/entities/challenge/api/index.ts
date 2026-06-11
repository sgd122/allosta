import { pfetch } from '@/shared/api';
import type { Challenge } from '../types';

export async function getChallenges(): Promise<Challenge[]> {
  return pfetch<Challenge[]>('challenges');
}
