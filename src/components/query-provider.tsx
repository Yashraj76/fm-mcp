'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMemo } from 'react'

interface QueryProviderProps {
  children: React.ReactNode
  // Scoping the client to a userId ensures a fresh empty cache is created
  // for every new user session — preventing cross-user data leakage.
  userId?: string
}

export function QueryProvider({ children, userId }: QueryProviderProps) {
  // useMemo with userId as dependency: re-creates client when user changes.
  // This is intentional — we WANT a new client (and empty cache) per user.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId]
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
