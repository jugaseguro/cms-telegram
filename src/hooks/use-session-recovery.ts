/**
 * useSessionRecovery + getGlobalSignal
 *
 * Provides a global AbortController that can be used to abort all in-flight
 * Supabase HTTP requests when the device wakes from sleep.
 *
 * Why: Supabase-JS's internal fetch queue gets stuck after OS sleep.
 * The module-level `supabase` singleton cannot be replaced at runtime
 * (all hooks already hold a reference to the old instance).
 *
 * Solution: pass an AbortSignal to each Supabase query. When the tab becomes
 * visible after being hidden for a while, we abort the current controller
 * (which kills all stuck in-flight requests) and create a new one.
 * React Query will then automatically retry each aborted query with the new signal.
 */

'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const MIN_HIDDEN_MS = 8_000  // only recover if hidden for at least 8 seconds

// Module-level controller so all queryFns can import and use it
let globalController = new AbortController()

export function getGlobalSignal() {
  return globalController.signal
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
      console.log('[SessionRecovery] Tab visible after sleep — aborting stuck fetches and refreshing session...')

      ;(async () => {
        try {
          // 1. Abort ALL in-flight Supabase HTTP requests (kills the stuck fetch queue)
          globalController.abort()
          globalController = new AbortController()
          console.log('[SessionRecovery] Aborted all in-flight requests. New controller ready.')

          // 2. Proactively refresh the auth session on the existing client
          const supabase = createClient()
          const { error } = await supabase.auth.refreshSession()
          if (error) {
            console.warn('[SessionRecovery] Session refresh failed:', error.message)
          } else {
            console.log('[SessionRecovery] Session refreshed successfully.')
          }

          // 3. Invalidate conversations and active messages — realtime channels
          // may have missed events during sleep, so we need a full refresh
          await queryClient.invalidateQueries({ queryKey: ['conversations'] })
          await queryClient.invalidateQueries({ queryKey: ['messages'] })
          console.log('[SessionRecovery] Recovery complete.')
        } catch (err) {
          console.error('[SessionRecovery] Error during recovery:', err)
        } finally {
          recoveringRef.current = false
        }
      })()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [queryClient])
}
