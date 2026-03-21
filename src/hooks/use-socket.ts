import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useRealtimeStore } from '@/stores/realtime-store'
import { useFeatureFlags } from '@/stores/feature-flags'
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

/**
 * Manages the Socket.IO connection lifecycle.
 * Connects when auth is ready and chatV2 is enabled.
 * Updates the shared RealtimeStore status (reused by RealtimeStatusBanner).
 */
export function useSocket() {
  const { isInitialized, user } = useAuthStore()
  const chatV2 = useFeatureFlags((s) => s.chatV2)
  const setStatus = useRealtimeStore((s) => s.setStatus)
  const connectedRef = useRef(false)

  useEffect(() => {
    if (!chatV2 || !isInitialized || !user) return

    let cancelled = false

    async function connect() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled || !session?.access_token) return

        setStatus('connecting')
        const socket = connectSocket(session.access_token)

        socket.on('connect', () => {
          if (!cancelled) {
            console.log('[socket.io] Connected:', socket.id)
            connectedRef.current = true
            setStatus('connected')
          }
        })

        socket.on('disconnect', (reason) => {
          if (!cancelled) {
            console.log('[socket.io] Disconnected:', reason)
            connectedRef.current = false
            if (reason === 'io server disconnect') {
              // Server kicked us, try to reconnect
              setStatus('reconnecting')
              socket.connect()
            } else {
              setStatus('reconnecting')
            }
          }
        })

        socket.on('connect_error', (err) => {
          if (!cancelled) {
            console.warn('[socket.io] Connection error:', err.message)
            setStatus('reconnecting')
          }
        })
      } catch (err) {
        console.error('[socket.io] Failed to initialize:', err)
        setStatus('disconnected')
      }
    }

    connect()

    return () => {
      cancelled = true
      disconnectSocket()
      connectedRef.current = false
    }
  }, [chatV2, isInitialized, user, setStatus])

  return getSocket()
}
