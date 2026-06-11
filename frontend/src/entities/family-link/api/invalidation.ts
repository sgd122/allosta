import type { QueryClient } from '@tanstack/react-query';
import { testResultKeys } from '@/entities/test-result/api/keys';
import { familyLinkKeys } from './keys';

export { familyLinkKeys } from './keys';

export async function invalidateAfterFamilyLinkAccepted(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: familyLinkKeys.familyLinks }),
    queryClient.invalidateQueries({ queryKey: testResultKeys.list }),
  ]);
}

export async function invalidateAfterFamilyLinkRevoked(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: familyLinkKeys.familyLinks }),
    queryClient.invalidateQueries({ queryKey: testResultKeys.list }),
  ]);
}
