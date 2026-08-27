'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from '@/lib/api/client'

/**
 * One QueryClient per browser session, created in state rather than at module
 * scope. A module-level client would be shared across requests on the server
 * and leak one user's cached data into another's render.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Long enough that moving between admin screens doesn't refetch,
            // short enough that a stale list corrects itself on the next visit.
            staleTime: 30_000,
            // A 4xx is an answer, not a blip — retrying an expired code or a
            // 403 just delays the message the user needs to see.
            retry: (failureCount, error) =>
              error instanceof ApiError && error.status < 500
                ? false
                : failureCount < 2,
          },
          mutations: {
            retry: false,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
