'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

type Props = { children: ReactNode };

/**
 * Client-side providers, wrapping the whole app in the root layout:
 *  - TanStack Query owns SERVER state (fetching, caching, mutations).
 */
export function Providers({ children }: Props) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Operational data (schedule, bookings, test-results, slots,
            // analytics) must read fresh. Default to always-stale so it
            // refetches on mount / focus / reconnect. Queries that are
            // genuinely slow-changing (currentUser, product catalog) opt back
            // in with their own staleTime override at the call site.
            staleTime: 0,
            retry: 1,
            refetchOnMount: true,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
