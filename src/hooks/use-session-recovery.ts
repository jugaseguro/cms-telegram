/**
 * useSessionRecovery
 *
 * THE SINGLE authority for recovering from device sleep / long idle.
 * All other visibility handlers should NOT call auth operations to prevent
 * auth lock contention.
 *
 * After sleep, Supabase's internal HTTP connections die but the auth lock queue
 * keeps growing as every handler tries getUser()/refreshSession() simultaneously.
 * This caused 30-48s freezes (4 handlers × 12s lock timeout).
 *
 * Fix: ONE handler that resets the client (clears dead HTTP + lock queue),
 * retries auth once, and only hard-redirects to /login if the refresh token
 * is truly expired (not just a momentary network blip).
 */

'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient, resetClient } from '@/lib/supabase/client'

// Only recover if hidden for at least 30 seconds.
// Short tab switches (< 30s) don't need recovery — polling handles them.
const MIN_HIDDEN_MS = 30_000

/** Error messages that indicate an unrecoverable session (redirect to login) */
function isSessionDead(errorMsg: string): boolean {
  const deadPatterns = [
    'Invalid Refresh Token',
    'Refresh Token Not Found',
    'User not found',
    'Invalid login credentials',
    'session_not_found',
  ]
  return deadPatterns.some((p) => errorMsg.includes(p))
}

export function useSessionRecovery() {
  const queryClient = useQueryClient()
  const hiddenAtRef = useRef<number | null>(null)
  const recoveringRef = useRef(false)

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now()
        return
      }

      const hiddenAt = hiddenAtRef.current
      hiddenAtRef.current = null

      if (!hiddenAt || Date.now() - hiddenAt < MIN_HIDDEN_MS) return
      if (recoveringRef.current) return

      recoveringRef.current = true
      console.log('[SessionRecovery] Tab visible after sleep — recovering...')

      ;(async () => {
        try {
          // 1. Reset the Supabase client: clears the auth lock queue and
          // forces a fresh HTTP connection pool on next createClient() call.
          await resetClient()

          // 2. Get a fresh client and try to refresh the session
          const supabase = createClient()
          const { error } = await supabase.auth.refreshSession()

          if (error) {
            console.warn('[SessionRecovery] Refresh failed:', error.message)

            if (isSessionDead(error.message)) {
              // Refresh token expired — no recovery possible
              console.log('[SessionRecovery] Session dead, redirecting to login...')
              window.location.href = '/login'
              return
            }

            // Temporary failure (network blip) — don't redirect, polling
            // will keep data flowing and auth will auto-retry later.
            console.log('[SessionRecovery] Temporary failure, polling will handle it.')
          } else {
            console.log('[SessionRecovery] Session refreshed successfully.')
          }

          // 3. Invalidate ALL queries so the UI refreshes with valid JWT
          await queryClient.invalidateQueries()
          console.log('[SessionRecovery] Recovery complete — all queries refreshed.')
        } catch (err) {
          const msg = (err as Error)?.message ?? ''
          console.warn('[SessionRecovery] Transient error during recovery:', msg)

          if (isSessionDead(msg)) {
            await resetClient()
            window.location.href = '/login'
          }
          // Otherwise: timeout or network error — don't redirect.
          // Polling keeps data flowing, next visibility change will retry.
        } finally {
          recoveringRef.current = false
        }
      })()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [queryClient])
}
