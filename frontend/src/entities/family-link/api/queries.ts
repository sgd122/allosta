import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { familyLinkKeys } from './keys';
import { invalidateAfterFamilyLinkAccepted, invalidateAfterFamilyLinkRevoked } from './invalidation';
import type { FamilyLink, FamilyLinkWithCounterpart, FamilyMember, InviteCode } from '../types';
import {
  acceptInviteCode,
  createInviteCode,
  getFamilyLinks,
  getFamilyMembers,
  revokeFamilyLink,
  setFamilyLinkRelation,
} from './index';


/** Family members linked to the authenticated user. */
export function useFamilyMembers() {
  return useQuery({
    queryKey: familyLinkKeys.familyMembers,
    queryFn: getFamilyMembers,
  });
}

/** Family links (with counterpart detail) for the authenticated user. */
export function useFamilyLinks() {
  return useQuery({
    queryKey: familyLinkKeys.familyLinks,
    queryFn: getFamilyLinks,
  });
}

/**
 * Generate a new family invite code.
 * Does not invalidate any queries — the code is returned directly to the caller.
 */
export function useCreateInviteCodeMutation() {
  return useMutation({
    mutationFn: (): Promise<InviteCode> => createInviteCode(),
  });
}

/**
 * Accept a family invite code; invalidates family links and test-results so
 * attributions are refreshed for the newly linked member.
 */
export function useAcceptInviteCodeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string): Promise<FamilyLink> => acceptInviteCode(code),
    onSuccess: () => {
      void invalidateAfterFamilyLinkAccepted(queryClient);
    },
  });
}

/**
 * Revoke a family link; invalidates family links and test-results so
 * attributions for the removed member are cleared.
 */
export function useRevokeFamilyLinkMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string): Promise<void> => revokeFamilyLink(linkId),
    onSuccess: () => {
      void invalidateAfterFamilyLinkRevoked(queryClient);
    },
  });
}

/**
 * Update the relation label on a family link; invalidates family links only.
 */
export function useSetFamilyLinkRelationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      linkId,
      relation,
    }: {
      linkId: string;
      relation: string;
    }): Promise<FamilyLink> => setFamilyLinkRelation(linkId, relation),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: familyLinkKeys.familyLinks });
    },
  });
}

export type { FamilyLinkWithCounterpart, FamilyMember };

export { familyLinkKeys } from './keys';
