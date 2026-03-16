'use client'

import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { useState } from 'react'
import { Toaster } from '@/components/ui/sonner'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => {
            // Auth token refresh is handled automatically by Supabase's
            // autoRefreshToken mechanism. No manual getUser() call needed
            // here — it was causing Navigator Lock contention.
            if (process.env.NODE_ENV === 'development') {
              const msg = (error as { message?: string })?.message ?? ''
              const code = (error as { code?: string })?.code ?? ''
              if (
                msg.includes('JWT') ||
                msg.includes('token') ||
                code === 'PGRST301' ||
                code === '401' ||
                code === '403'
              ) {
                console.warn('[QueryCache] Auth-related query error:', msg || code)
              }
            }
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            retry: 2,
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
          },
        },
      })
  )

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
