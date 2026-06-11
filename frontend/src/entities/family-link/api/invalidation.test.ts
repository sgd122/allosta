import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { testResultKeys } from '@/entities/test-result/api/keys';
import { familyLinkKeys, invalidateAfterFamilyLinkAccepted, invalidateAfterFamilyLinkRevoked } from './invalidation';

describe('family link invalidation helpers', () => {
  it('refreshes links and test-result attribution after accepting a code', async () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    await invalidateAfterFamilyLinkAccepted(queryClient);

    expect(spy).toHaveBeenCalledWith({ queryKey: familyLinkKeys.familyLinks });
    expect(spy).toHaveBeenCalledWith({ queryKey: testResultKeys.list });
  });

  it('refreshes links and test-result attribution after revoking a link', async () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    await invalidateAfterFamilyLinkRevoked(queryClient);

    expect(spy).toHaveBeenCalledWith({ queryKey: familyLinkKeys.familyLinks });
    expect(spy).toHaveBeenCalledWith({ queryKey: testResultKeys.list });
  });
});
