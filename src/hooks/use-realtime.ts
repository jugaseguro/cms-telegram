import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useChatStore } from '@/stores/chat-store'
import { useRealtimeStore } from '@/stores/realtime-store'
import { playNotificationSound } from '@/lib/notification-sound'
import { toast } from 'sonner'
import type { Message } from '@/lib/supabase/types'

const supabase = createClient()

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
  const markUnread = useChatStore((s) => s.markUnread)
  const setStatus = useRealtimeStore((s) => s.setStatus)
  const isFirstSubscription = useRef(true)
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const debouncedInvalidateConversations = useCallback(() => {
    clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    }, 500)
  }, [queryClient])

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
          debouncedInvalidateConversations()
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
            markUnread(msg.conversation_id)
            playNotificationSound()
            debouncedInvalidateConversations()
            // Safety net: refresh messages only if this is the active conversation
            const activeId = useChatStore.getState().activeConversationId
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
          if (isFirstSubscription.current) {
            isFirstSubscription.current = false
            // Invalidate on first subscribe to ensure fresh data after auth
            queryClient.invalidateQueries({ queryKey: ['conversations'] })
          } else {
            queryClient.invalidateQueries({ queryKey: ['conversations'] })
            queryClient.invalidateQueries({ queryKey: ['messages'] })
            toast.success('Conexión restablecida', { duration: 3000 })
          }
          setStatus('connected')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setStatus('reconnecting')
        } else if (status === 'CLOSED') {
          setStatus('disconnected')
        }
      })

    return () => {
      clearTimeout(debounceTimer.current)
      supabase.removeChannel(channel)
    }
  }, [enabled, queryClient, markUnread, setStatus, debouncedInvalidateConversations])
}
