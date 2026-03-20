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
const STUCK_CHANNEL_TIMEOUT_MS = 30_000

export function useRealtimeMessages(conversationId: string | null) {
  const queryClient = useQueryClient()
  const isFirstSubscription = useRef(true)

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
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (isFirstSubscription.current) {
            isFirstSubscription.current = false
          } else {
            queryClient.invalidateQueries({
              queryKey: ['messages', conversationId],
            })
          }
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, queryClient])
}

export function useRealtimeConversations(enabled = true) {
  const queryClient = useQueryClient()
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname
  const markUnread = useChatStore((s) => s.markUnread)
  const setStatus = useRealtimeStore((s) => s.setStatus)
  const isFirstSubscription = useRef(true)
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastReconnectAttempt = useRef(0)
  const stuckTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

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
      if (state !== 'joined') {
        lastReconnectAttempt.current = now
        // Refresh auth token before reconnecting so the new subscription
        // uses a valid JWT
        try { await supabase.auth.getUser() } catch { /* proceed anyway */ }
        channel.unsubscribe().then(() => {
          channel.subscribe()
        })
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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Clear stuck-channel timer on successful subscription
          clearTimeout(stuckTimer.current)

          if (isFirstSubscription.current) {
            isFirstSubscription.current = false
            // Invalidate on first subscribe to ensure fresh data after auth
            queryClient.invalidateQueries({ queryKey: ['conversations'] })
          } else {
            // WebSocket reconnected — only refresh conversations list.
            // Individual message queries are managed by useRealtimeMessages
            // per conversation, so a global messages invalidation is not needed
            // and would trigger many parallel fetches.
            queryClient.invalidateQueries({ queryKey: ['conversations'] })
            toast.success('Conexión restablecida', { duration: 3000 })
          }
          setStatus('connected')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setStatus('reconnecting')

          // Safety: if stuck in reconnecting for too long, force a full
          // channel teardown and resubscribe to recover from dead connections.
          clearTimeout(stuckTimer.current)
          stuckTimer.current = setTimeout(async () => {
            const ch = channelRef.current
            if (ch && ch.state !== 'joined') {
              try { await supabase.auth.getUser() } catch { /* proceed anyway */ }
              ch.unsubscribe().then(() => {
                ch.subscribe()
              })
            }
          }, STUCK_CHANNEL_TIMEOUT_MS)
        } else if (status === 'CLOSED') {
          setStatus('disconnected')
        }
      })

    channelRef.current = channel

    return () => {
      clearTimeout(debounceTimer.current)
      clearTimeout(stuckTimer.current)
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [enabled, queryClient, markUnread, setStatus])
}
