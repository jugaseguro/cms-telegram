import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import { useChatStore } from '@/stores/chat-store'
import { useFeatureFlags } from '@/stores/feature-flags'
import { useRealtimeStore } from '@/stores/realtime-store'
import { playNotificationSound } from '@/lib/notification-sound'

/**
 * Socket.IO replacement for useRealtimeConversations.
 * Listens for conversation:updated and message:new events globally,
 * handles unread badges, notification sounds, and query invalidation.
 */
export function useSocketConversations() {
  const queryClient = useQueryClient()
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname
  const markUnread = useChatStore((s) => s.markUnread)
  const chatV2 = useFeatureFlags((s) => s.chatV2)
  const socket = useRealtimeStore((s) => s.socket)
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const debouncedInvalidateConversations = useCallback(() => {
    if (debounceTimer.current) return
    debounceTimer.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      debounceTimer.current = undefined
    }, 500)
  }, [queryClient])

  const debouncedRef = useRef(debouncedInvalidateConversations)
  useEffect(() => {
    debouncedRef.current = debouncedInvalidateConversations
  }, [debouncedInvalidateConversations])

  useEffect(() => {
    if (!chatV2 || !socket) return

    // Handle conversation updates (status, assignment, etc.)
    function handleConversationUpdated() {
      debouncedRef.current()
    }

    // Handle new messages globally (for unread badges + notification sounds)
    function handleMessageNew(payload: { message: Record<string, unknown>; conversationId: string }) {
      const msg = payload.message
      const msgConversationId = payload.conversationId

      // Only react to customer messages for unread/notification
      if (msg.sender_type === 'customer') {
        const isOnChats = pathnameRef.current === '/chats'
        const activeId = useChatStore.getState().activeConversationId

        if (!isOnChats || msgConversationId !== activeId) {
          markUnread(msgConversationId)
        }

        playNotificationSound()
      }

      debouncedRef.current()

    }

    socket.on('conversation:updated', handleConversationUpdated)
    socket.on('message:new', handleMessageNew)

    // Initial data load on connect
    function handleConnect() {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    }
    socket.on('connect', handleConnect)

    return () => {
      clearTimeout(debounceTimer.current)
      socket.off('conversation:updated', handleConversationUpdated)
      socket.off('message:new', handleMessageNew)
      socket.off('connect', handleConnect)
    }
  }, [chatV2, socket, queryClient, markUnread])
}
