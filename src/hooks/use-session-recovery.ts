/**
 * useSessionRecovery
 *
 * Watches for document visibility changes and, when the tab becomes visible
 * after being hidden (device sleep, tab switch, etc.), proactively:
 *   1. Resets the Supabase singleton client to flush the stuck auth token queue.
 *   2. Refreshes the session on the new client so subsequent queries have a valid JWT.
 *   3. Invalidates all React Query caches so stale data is refetched with the fresh client.
 *
 * Without this, Supabase-JS's internal fetch queue can remain stuck indefinitely
 * after an OS sleep, causing all queries to hang with no "Fetch complete" log.
 */

'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { resetClient, createClient } from '@/lib/supabase/client'

const MIN_HIDDEN_MS = 5_000  // only recover if hidden for at least 5 seconds

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

      // Tab became visible
      const hiddenAt = hiddenAtRef.current
      hiddenAtRef.current = null

      // Only recover if the tab was hidden long enough to risk a stale session
      if (!hiddenAt || Date.now() - hiddenAt < MIN_HIDDEN_MS) return
      if (recoveringRef.current) return

      recoveringRef.current = true
      console.log('[SessionRecovery] Tab visible after sleep — resetting Supabase client and refreshing session...')

      ;(async () => {
        try {
          // 1. Destroy the frozen singleton client + lock queue
          resetClient()

          // 2. Create fresh client and force a session refresh
          const freshClient = createClient()
          const { error } = await freshClient.auth.refreshSession()
          if (error) {
            console.warn('[SessionRecovery] Session refresh failed — user may need to log in again:', error.message)
            return
          }

          // 3. Invalidate all cached queries so they refetch with the fresh session
          console.log('[SessionRecovery] Session refreshed. Invalidating all queries...')
          await queryClient.invalidateQueries()
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
