import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useFeatureFlags } from '@/stores/feature-flags'
import { useRealtimeStore } from '@/stores/realtime-store'
import type { Message } from '@/lib/supabase/types'

/**
 * Socket.IO replacement for useRealtimeMessages.
 * Joins the conversation room, listens for message:new events,
 * and updates the React Query cache (same logic as Supabase Realtime v1).
 */
export function useSocketMessages(conversationId: string | null) {
  const queryClient = useQueryClient()
  const chatV2 = useFeatureFlags((s) => s.chatV2)
  const socket = useRealtimeStore((s) => s.socket)

  useEffect(() => {
    if (!chatV2 || !conversationId || !socket) return

    // Join conversation room
    socket.emit('join:conversation', { conversationId })

    // Listen for new messages in this conversation
    function handleMessageNew(payload: { message: Record<string, unknown>; conversationId: string }) {
      if (payload.conversationId !== conversationId) return

      // Skip lightweight notification payloads (no id = global notification, not full message)
      if (!payload.message.id) return

      const newMsg = payload.message as unknown as Message

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

    socket.on('message:new', handleMessageNew)

    return () => {
      socket.off('message:new', handleMessageNew)
      socket.emit('leave:conversation', { conversationId })
    }
  }, [chatV2, conversationId, socket, queryClient])
}
