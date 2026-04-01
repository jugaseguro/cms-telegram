'use client'

import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { useState } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'
import { useSessionRecovery } from '@/hooks/use-session-recovery'

function ProvidersInner({ children }: { children: React.ReactNode }) {
  useSessionRecovery()
  return (
    <>
      {children}
      <Toaster />
    </>
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => {
            const msg = (error as { message?: string })?.message ?? ''
            const code = (error as { code?: string })?.code ?? ''
            const isAuthError =
              msg.includes('JWT') ||
              msg.includes('token') ||
              code === 'PGRST301' ||
              code === '401' ||
              code === '403'

            console.warn('[QueryCache] Query error:', msg || code)

            if (isAuthError) {
              toast.error('Error de sesión. Recargá la página si los datos no aparecen.')
            }
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 60_000,           // 60s stale time (up from 30s) — realtime/socket events handle cache invalidation
            gcTime: 5 * 60_000,          // Keep unused query data in cache 5 min to prevent re-fetches on navigation
            refetchOnWindowFocus: false,  // Realtime WebSockets handle live updates; refetching all queries on tab focus caused connection saturation and UI freezes
            retry: 1,
            retryDelay: 2000,
          },
        },
      })
  )

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <ProvidersInner>{children}</ProvidersInner>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
