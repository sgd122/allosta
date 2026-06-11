import { useQuery } from '@tanstack/react-query';
import { getProducts } from './index';

/**
 * Query-key factory for the product slice. Centralizing keys here keeps the
 * cache identity consistent between the hook below and any invalidation done
 * elsewhere (e.g. after an admin updates the product catalog).
 */
export const productKeys = {
  all: ['products'] as const,
};

/** Product catalog. Matches call-site options in ConsultationRecordForm.tsx exactly. */
export function useProducts() {
  return useQuery({
    queryKey: productKeys.all,
    queryFn: getProducts,
    staleTime: 5 * 60 * 1000,
  });
}
