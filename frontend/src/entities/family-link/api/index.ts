import { pfetch } from '@/shared/api';
import type { FamilyLink, FamilyLinkWithCounterpart, FamilyMember, InviteCode } from '../types';

export async function getFamilyMembers(): Promise<FamilyMember[]> {
  return pfetch<FamilyMember[]>('me/family-members');
}

export async function getFamilyLinks(): Promise<FamilyLinkWithCounterpart[]> {
  return pfetch<FamilyLinkWithCounterpart[]>('family/links');
}

export async function createInviteCode(): Promise<InviteCode> {
  return pfetch<InviteCode>('family/invite-codes', { method: 'POST' });
}

export async function acceptInviteCode(code: string): Promise<FamilyLink> {
  return pfetch<FamilyLink>(`family/invite-codes/${code}/accept`, { method: 'POST' });
}

export async function revokeFamilyLink(linkId: string): Promise<void> {
  return pfetch<void>(`family/links/${linkId}`, { method: 'DELETE' });
}

export async function setFamilyLinkRelation(linkId: string, relation: string): Promise<FamilyLink> {
  return pfetch<FamilyLink>(`family/links/${linkId}/relation`, {
    method: 'PATCH',
    body: JSON.stringify({ relation }),
  });
}
