/**
 * useSessionRecovery
 *
 * THE SINGLE authority for recovering from device sleep / long idle.
 * All other visibility handlers have been removed to prevent auth lock contention.
 *
 * After sleep, Supabase's internal HTTP connections die but the auth lock queue
 * keeps growing as every handler tries getUser()/refreshSession() simultaneously.
 * This caused 30-48s freezes (4 handlers × 12s lock timeout).
 *
 * Fix: ONE handler that resets the client (clears dead HTTP + lock queue),
 * retries auth once, and hard-redirects to /login if the session is truly dead.
 */

'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient, resetClient } from '@/lib/supabase/client'

const MIN_HIDDEN_MS = 8_000  // only recover if hidden for at least 8 seconds

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
          // Without this, the dead HTTP connections from sleep hang forever
          // and each queued auth op waits its own 5s timeout.
          resetClient()

          // 2. Get a fresh client and try to refresh the session
          const supabase = createClient()
          const { error } = await supabase.auth.refreshSession()

          if (error) {
            console.warn('[SessionRecovery] Refresh failed:', error.message)
            // Session is dead (expired refresh token after long sleep).
            // Hard redirect clears all React state + stale singletons.
            console.log('[SessionRecovery] Redirecting to login...')
            window.location.href = '/login'
            return
          }

          console.log('[SessionRecovery] Session refreshed successfully.')

          // 3. Invalidate queries so the UI refreshes with valid JWT
          await queryClient.invalidateQueries({ queryKey: ['conversations'] })
          console.log('[SessionRecovery] Recovery complete.')
        } catch (err) {
          console.error('[SessionRecovery] Error during recovery:', err)
          // Auth operation timed out — network is likely still broken
          // or refresh token expired. Redirect to login for clean slate.
          resetClient()
          window.location.href = '/login'
        } finally {
          recoveringRef.current = false
        }
      })()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [queryClient])
}
