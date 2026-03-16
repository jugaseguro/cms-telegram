'use client'

import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { useState } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { createClient } from '@/lib/supabase/client'

let lastAuthRetry = 0
const AUTH_RETRY_THROTTLE = 10_000

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => {
            const msg = (error as { message?: string })?.message ?? ''
            const code = (error as { code?: string })?.code ?? ''
            if (
              msg.includes('JWT') ||
              msg.includes('token') ||
              code === 'PGRST301' ||
              code === '401' ||
              code === '403'
            ) {
              // Throttle auth refresh to avoid lock contention when multiple queries fail at once
              const now = Date.now()
              if (now - lastAuthRetry > AUTH_RETRY_THROTTLE) {
                lastAuthRetry = now
                createClient().auth.getUser()
              }
            }
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            retry: (failureCount, error) => {
              const msg = (error as { message?: string })?.message ?? ''
              // More retries with backoff for lock contention errors
              if (msg.includes('AbortError') || msg.includes('Lock broken')) {
                return failureCount < 4
              }
              return failureCount < 2
            },
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
