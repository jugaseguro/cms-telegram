import { useEffect, useRef, useState, useCallback } from 'react'
import { getSocket } from '@/lib/socket'
import { useFeatureFlags } from '@/stores/feature-flags'

interface TypingUser {
  userId: string
  userName: string
}

const TYPING_TIMEOUT_MS = 5_000
const EMIT_THROTTLE_MS = 3_000

/**
 * Listens for typing indicators in a conversation.
 * Auto-clears after 5s if typing:stop is missed.
 */
export function useTypingIndicator(conversationId: string | null) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const chatV2 = useFeatureFlags((s) => s.chatV2)
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    if (!chatV2 || !conversationId) {
      setTypingUsers([])
      return
    }

    const socket = getSocket()
    if (!socket) return

    function handleTypingStart(payload: { conversationId: string; userId: string; userName: string }) {
      if (payload.conversationId !== conversationId) return

      setTypingUsers((prev) => {
        if (prev.some((u) => u.userId === payload.userId)) return prev
        return [...prev, { userId: payload.userId, userName: payload.userName }]
      })

      // Auto-clear after timeout
      const existing = timersRef.current.get(payload.userId)
      if (existing) clearTimeout(existing)
      timersRef.current.set(
        payload.userId,
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u.userId !== payload.userId))
          timersRef.current.delete(payload.userId)
        }, TYPING_TIMEOUT_MS)
      )
    }

    function handleTypingStop(payload: { conversationId: string; userId: string }) {
      if (payload.conversationId !== conversationId) return

      setTypingUsers((prev) => prev.filter((u) => u.userId !== payload.userId))
      const timer = timersRef.current.get(payload.userId)
      if (timer) {
        clearTimeout(timer)
        timersRef.current.delete(payload.userId)
      }
    }

    socket.on('typing:start', handleTypingStart)
    socket.on('typing:stop', handleTypingStop)

    return () => {
      socket.off('typing:start', handleTypingStart)
      socket.off('typing:stop', handleTypingStop)
      // Clear all timers
      for (const timer of timersRef.current.values()) clearTimeout(timer)
      timersRef.current.clear()
      setTypingUsers([])
    }
  }, [chatV2, conversationId])

  return { typingUsers }
}

/**
 * Emits typing indicators, throttled to once per 3s.
 * Call emitTyping() on keypress in the message input.
 * Call stopTyping() on blur or send.
 */
export function useEmitTyping(conversationId: string | null, userName: string) {
  const chatV2 = useFeatureFlags((s) => s.chatV2)
  const lastEmitRef = useRef(0)

  const emitTyping = useCallback(() => {
    if (!chatV2 || !conversationId) return

    const now = Date.now()
    if (now - lastEmitRef.current < EMIT_THROTTLE_MS) return
    lastEmitRef.current = now

    const socket = getSocket()
    if (!socket?.connected) return

    socket.emit('typing:start', { conversationId, userName })
  }, [chatV2, conversationId, userName])

  const stopTyping = useCallback(() => {
    if (!chatV2 || !conversationId) return

    lastEmitRef.current = 0
    const socket = getSocket()
    if (!socket?.connected) return

    socket.emit('typing:stop', { conversationId })
  }, [chatV2, conversationId])

  return { emitTyping, stopTyping }
}
