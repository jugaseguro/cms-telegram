'use client'

import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { useState } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'

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
