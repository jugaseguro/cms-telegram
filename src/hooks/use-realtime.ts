import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useChatStore } from '@/stores/chat-store'
import { useRealtimeStore } from '@/stores/realtime-store'
import { playNotificationSound } from '@/lib/notification-sound'
import { toast } from 'sonner'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Message } from '@/lib/supabase/types'

const supabase = createClient()

/** Minimum gap between visibility-triggered reconnection attempts */
const RECONNECT_THROTTLE_MS = 10_000
/** If the channel stays in reconnecting state for this long, force a full teardown */
const STUCK_CHANNEL_TIMEOUT_MS = 15_000
/** How often to check channel health and refresh JWT (45s) */
const HEALTH_CHECK_INTERVAL_MS = 45_000
/** How often to force a conversations refetch as safety net when realtime is healthy (5min) */
const SAFETY_REFETCH_INTERVAL_MS = 5 * 60_000

/**
 * Safely tears down and resubscribes a channel with a fresh JWT.
 * Handles errors at every step so the reconnection flow never silently breaks.
 */
async function reconnectChannel(channel: RealtimeChannel): Promise<void> {
  try {
    await supabase.auth.refreshSession()
  } catch {
    // proceed anyway — the token might still be valid
  }
  try {
    await channel.unsubscribe()
  } catch (err) {
    console.warn('[reconnectChannel] unsubscribe error:', err)
  }
  try {
    channel.subscribe()
  } catch (err) {
    console.warn('[reconnectChannel] subscribe error:', err)
  }
}

export function useRealtimeMessages(conversationId: string | null) {
  const queryClient = useQueryClient()
  const isFirstSubscription = useRef(true)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const healthIntervalRef = useRef<ReturnType<typeof setInterval>>(undefined)

  useEffect(() => {
    if (!conversationId) return
    isFirstSubscription.current = true

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          try {
            const newMsg = payload.new as Message
            queryClient.setQueryData(
              ['messages', conversationId],
              (old: { pages: Message[][]; pageParams: unknown[] } | undefined) => {
                if (!old) return { pages: [[newMsg]], pageParams: [null] }
                const pages = [...old.pages]
                const lastPage = pages[pages.length - 1]
                // Dedup: skip if already present
                if (lastPage.some((m) => m.id === newMsg.id)) return old
                // Remove optimistic messages and append real one
                pages[pages.length - 1] = [
                  ...lastPage.filter((m) => !m.id.startsWith('optimistic-')),
                  newMsg,
                ]
                return { ...old, pages }
              }
            )
          } catch (err) {
            console.error('[useRealtimeMessages] Error processing payload:', err)
          }
        }
      )
      .subscribe((status, err) => {
        console.log(`[useRealtimeMessages:${conversationId}] Channel status: ${status}`, err)
        if (status === 'SUBSCRIBED') {
          if (isFirstSubscription.current) {
            isFirstSubscription.current = false
          } else {
            // Reconnected — refresh messages if query is idle
            const queryState = queryClient.getQueryState(['messages', conversationId])
            const isAlreadyFetching = queryState?.fetchStatus === 'fetching'
            const isError = queryState?.status === 'error'
            if (!isAlreadyFetching && !isError) {
              queryClient.invalidateQueries({
                queryKey: ['messages', conversationId],
              })
            }
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Auto-reconnect for message channels too
          console.warn(`[useRealtimeMessages:${conversationId}] Channel error/timeout, reconnecting...`)
          setTimeout(() => {
            if (channelRef.current === channel) {
              reconnectChannel(channel)
            }
          }, 2_000)
        }
      })

    channelRef.current = channel

    // Periodic health check: if channel is not joined, force reconnect
    healthIntervalRef.current = setInterval(() => {
      if (channel.state !== 'joined') {
        console.warn(`[useRealtimeMessages:${conversationId}] Health check: channel state is ${channel.state}, reconnecting...`)
        reconnectChannel(channel)
      }
    }, HEALTH_CHECK_INTERVAL_MS)

    return () => {
      clearInterval(healthIntervalRef.current)
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [conversationId, queryClient])
}

export function useRealtimeConversations(enabled = true) {
  const queryClient = useQueryClient()
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])
  const markUnread = useChatStore((s) => s.markUnread)
  const setStatus = useRealtimeStore((s) => s.setStatus)
  const isFirstSubscription = useRef(true)
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastReconnectAttempt = useRef(0)
  const stuckTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const healthIntervalRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const safetyRefetchRef = useRef<ReturnType<typeof setInterval>>(undefined)

  const debouncedInvalidateConversations = useCallback(() => {
    if (debounceTimer.current) return
    debounceTimer.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      debounceTimer.current = undefined
    }, 500)
  }, [queryClient])

  // Stable ref so the callback can be used inside the effect without
  // being listed as a dependency (avoids unnecessary subscription teardowns)
  const debouncedRef = useRef(debouncedInvalidateConversations)
  useEffect(() => {
    debouncedRef.current = debouncedInvalidateConversations
  }, [debouncedInvalidateConversations])

  // Visibility-based reconnection: when the user returns to the tab,
  // check if the realtime channel is healthy and force reconnect if not.
  useEffect(() => {
    if (!enabled) return

    async function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return

      const now = Date.now()
      if (now - lastReconnectAttempt.current < RECONNECT_THROTTLE_MS) return

      const channel = channelRef.current
      if (!channel) return

      // If the channel is not in SUBSCRIBED state, force a resubscribe
      const state = channel.state
      console.log(`[useRealtime] Tab visible! Checking channel state:`, state)
      if (state !== 'joined') {
        console.warn(`[useRealtime] Channel dead (${state}). Forcing reconnect...`)
        lastReconnectAttempt.current = now
        await reconnectChannel(channel)
      } else {
        // Channel looks healthy, but proactively refresh JWT to prevent
        // silent expiry while the tab was hidden
        try { await supabase.auth.refreshSession() } catch { /* ok */ }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    isFirstSubscription.current = true

    const channel = supabase
      .channel('global-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
        },
        () => {
          debouncedRef.current()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: 'sender_type=eq.customer',
        },
        (payload) => {
          const msg = payload.new as {
            conversation_id?: string
          }
          if (msg.conversation_id) {
            const isOnChats = pathnameRef.current === '/chats'
            const activeId = useChatStore.getState().activeConversationId

            if (!isOnChats || msg.conversation_id !== activeId) {
              // Mark as unread if user is not viewing this conversation
              markUnread(msg.conversation_id)
            }

            playNotificationSound()
            debouncedRef.current()

            // Refresh messages if this is the active conversation
            if (msg.conversation_id === activeId) {
              queryClient.invalidateQueries({
                queryKey: ['messages', msg.conversation_id],
              })
            }
          }
        }
      )
      .subscribe((status, err) => {
        console.log(`[useRealtimeConversations] Global channel status: ${status}`, err)
        if (status === 'SUBSCRIBED') {
          // Clear stuck-channel timer on successful subscription
          clearTimeout(stuckTimer.current)

          if (isFirstSubscription.current) {
            isFirstSubscription.current = false
            // Invalidate on first subscribe to ensure fresh data after auth
            queryClient.invalidateQueries({ queryKey: ['conversations'] })
          } else {
            // WebSocket reconnected — refresh conversations list only if it's not
            // already loading or in an error state (to avoid cascading timeouts)
            const convState = queryClient.getQueryState(['conversations'])
            const convFetching = convState?.fetchStatus === 'fetching'
            const convError = convState?.status === 'error'
            if (!convFetching && !convError) {
              queryClient.invalidateQueries({ queryKey: ['conversations'] })
            }
            toast.success('Conexión restablecida', { duration: 3000 })
          }
          setStatus('connected')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setStatus('reconnecting')

          // Safety: if stuck in reconnecting for too long, force a full
          // channel teardown and resubscribe to recover from dead connections.
          clearTimeout(stuckTimer.current)
          stuckTimer.current = setTimeout(() => {
            const ch = channelRef.current
            if (ch && ch.state !== 'joined') {
              reconnectChannel(ch)
            }
          }, STUCK_CHANNEL_TIMEOUT_MS)
        } else if (status === 'CLOSED') {
          setStatus('disconnected')
        }
      })

    channelRef.current = channel

    // Periodic health check: detect dead channels and refresh JWT proactively.
    // This is the main fix for "realtime stops after N minutes" — the channel
    // can silently die (e.g., JWT expired, network blip) without triggering
    // a CHANNEL_ERROR event. This interval catches those cases.
    healthIntervalRef.current = setInterval(async () => {
      const ch = channelRef.current
      if (!ch) return

      if (ch.state !== 'joined') {
        console.warn(`[useRealtime] Health check: channel state is ${ch.state}, reconnecting...`)
        setStatus('reconnecting')
        await reconnectChannel(ch)
      } else {
        // Channel is healthy — proactively refresh JWT to prevent expiry
        try { await supabase.auth.refreshSession() } catch { /* ok */ }
      }
    }, HEALTH_CHECK_INTERVAL_MS)

    // Safety-net periodic refetch: even when realtime is working, do a full
    // conversations refresh every 5 minutes to catch any missed events.
    safetyRefetchRef.current = setInterval(() => {
      const convState = queryClient.getQueryState(['conversations'])
      const convFetching = convState?.fetchStatus === 'fetching'
      if (!convFetching) {
        console.log('[useRealtime] Safety net: periodic conversations refetch')
        queryClient.invalidateQueries({ queryKey: ['conversations'] })
      }
    }, SAFETY_REFETCH_INTERVAL_MS)

    return () => {
      clearTimeout(debounceTimer.current)
      clearTimeout(stuckTimer.current)
      clearInterval(healthIntervalRef.current)
      clearInterval(safetyRefetchRef.current)
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [enabled, queryClient, markUnread, setStatus])
}
