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

// ─── Polling intervals ───────────────────────────────────────────────
// Polling is the RELIABLE fallback. Realtime is an optimization on top.
const MESSAGES_POLL_MS = 4_000          // Poll active conversation messages every 4s
const CONVERSATIONS_POLL_MS = 8_000     // Poll conversation list every 8s
const CONVERSATIONS_IDLE_POLL_MS = 30_000 // When realtime is healthy, poll less often
const RECONNECT_THROTTLE_MS = 10_000
const STUCK_CHANNEL_TIMEOUT_MS = 15_000

/**
 * Safely reconnect a realtime channel.
 * Non-critical — if this fails, polling will keep data flowing.
 * NOTE: Does NOT call refreshSession() — SessionRecovery handles auth
 * to prevent auth lock contention after sleep.
 */
async function reconnectChannel(channel: RealtimeChannel): Promise<void> {
  try { await channel.unsubscribe() } catch { /* ok */ }
  try { channel.subscribe() } catch { /* ok */ }
}

// ─── Messages: polling + realtime boost ──────────────────────────────

export function useRealtimeMessages(conversationId: string | null) {
  const queryClient = useQueryClient()
  const isFirstSubscription = useRef(true)
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined)

  useEffect(() => {
    if (!conversationId) return
    isFirstSubscription.current = true

    // 1. POLLING — the reliable base. Checks for new messages every 4 seconds.
    //    This ensures data always flows even if realtime dies silently.
    pollRef.current = setInterval(() => {
      const state = queryClient.getQueryState(['messages', conversationId])
      // Only poll if not already fetching
      if (state?.fetchStatus !== 'fetching') {
        queryClient.invalidateQueries({
          queryKey: ['messages', conversationId],
        })
      }
    }, MESSAGES_POLL_MS)

    // 2. REALTIME — instant delivery when it works. Bonus, not required.
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
                if (lastPage.some((m) => m.id === newMsg.id)) return old
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
        console.log(`[Realtime:messages:${conversationId.slice(0, 8)}] ${status}`, err || '')
      })

    return () => {
      clearInterval(pollRef.current)
      supabase.removeChannel(channel)
    }
  }, [conversationId, queryClient])
}

// ─── Conversations: polling + realtime boost ─────────────────────────

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
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const realtimeHealthy = useRef(false)

  const invalidateConversations = useCallback(() => {
    if (debounceTimer.current) return
    debounceTimer.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      debounceTimer.current = undefined
    }, 500)
  }, [queryClient])

  const debouncedRef = useRef(invalidateConversations)
  useEffect(() => {
    debouncedRef.current = invalidateConversations
  }, [invalidateConversations])

  // Visibility-based recovery
  useEffect(() => {
    if (!enabled) return

    async function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return

      const now = Date.now()
      if (now - lastReconnectAttempt.current < RECONNECT_THROTTLE_MS) return

      // Always refresh data when tab becomes visible
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      const activeId = useChatStore.getState().activeConversationId
      if (activeId) {
        queryClient.invalidateQueries({ queryKey: ['messages', activeId] })
      }

      // Try to reconnect realtime channel if dead
      // Don't call refreshSession() here — SessionRecovery handles auth
      // to prevent auth lock contention after sleep.
      const channel = channelRef.current
      if (channel && channel.state !== 'joined') {
        lastReconnectAttempt.current = now
        await reconnectChannel(channel)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [enabled, queryClient])

  useEffect(() => {
    if (!enabled) return
    isFirstSubscription.current = true
    realtimeHealthy.current = false

    // 1. POLLING — the reliable base.
    //    Polls faster when realtime is down, slower when it's healthy.
    pollRef.current = setInterval(() => {
      const interval = realtimeHealthy.current
        ? CONVERSATIONS_IDLE_POLL_MS
        : CONVERSATIONS_POLL_MS
      // This check lets us vary frequency within a fixed interval:
      // the interval runs at the faster rate, but we skip ticks when healthy.
      const now = Date.now()
      const lastUpdated = queryClient.getQueryState(['conversations'])?.dataUpdatedAt ?? 0
      if (now - lastUpdated < interval) return

      const convState = queryClient.getQueryState(['conversations'])
      if (convState?.fetchStatus !== 'fetching') {
        console.log(`[Poll] Refreshing conversations (realtime ${realtimeHealthy.current ? 'healthy' : 'down'})`)
        queryClient.invalidateQueries({ queryKey: ['conversations'] })
      }
    }, CONVERSATIONS_POLL_MS)

    // 2. REALTIME — instant updates when it works
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
          const msg = payload.new as { conversation_id?: string }
          if (msg.conversation_id) {
            const isOnChats = pathnameRef.current === '/chats'
            const activeId = useChatStore.getState().activeConversationId

            if (!isOnChats || msg.conversation_id !== activeId) {
              markUnread(msg.conversation_id)
            }

            playNotificationSound()
            debouncedRef.current()

            if (msg.conversation_id === activeId) {
              queryClient.invalidateQueries({
                queryKey: ['messages', msg.conversation_id],
              })
            }
          }
        }
      )
      .subscribe((status, err) => {
        console.log(`[Realtime:global] ${status}`, err || '')
        if (status === 'SUBSCRIBED') {
          clearTimeout(stuckTimer.current)
          realtimeHealthy.current = true

          if (isFirstSubscription.current) {
            isFirstSubscription.current = false
            queryClient.invalidateQueries({ queryKey: ['conversations'] })
          } else {
            const convState = queryClient.getQueryState(['conversations'])
            if (convState?.fetchStatus !== 'fetching' && convState?.status !== 'error') {
              queryClient.invalidateQueries({ queryKey: ['conversations'] })
            }
            toast.success('Conexión en tiempo real restablecida', { duration: 3000 })
          }
          setStatus('connected')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          realtimeHealthy.current = false
          setStatus('reconnecting')

          clearTimeout(stuckTimer.current)
          stuckTimer.current = setTimeout(() => {
            const ch = channelRef.current
            if (ch && ch.state !== 'joined') {
              reconnectChannel(ch)
            }
          }, STUCK_CHANNEL_TIMEOUT_MS)
        } else if (status === 'CLOSED') {
          realtimeHealthy.current = false
          setStatus('disconnected')
        }
      })

    channelRef.current = channel

    return () => {
      clearTimeout(debounceTimer.current)
      clearTimeout(stuckTimer.current)
      clearInterval(pollRef.current)
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [enabled, queryClient, markUnread, setStatus])
}
