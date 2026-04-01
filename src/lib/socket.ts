import { io, type Socket } from 'socket.io-client'
import { createClient } from '@/lib/supabase/client'

// ── Types (mirror server events) ──────────────────────────────────

export interface ServerToClientEvents {
  'message:new': (payload: { message: Record<string, unknown>; conversationId: string }) => void
  'conversation:updated': (payload: { conversationId: string; event: string }) => void
  'typing:start': (payload: { conversationId: string; userId: string; userName: string }) => void
  'typing:stop': (payload: { conversationId: string; userId: string }) => void
  'presence:update': (payload: { onlineAgentIds: string[] }) => void
  'recontact:summary': (payload: { ruleName: string; botName: string; sent: number; total: number }) => void
}

export interface ClientToServerEvents {
  'join:conversation': (payload: { conversationId: string }) => void
  'leave:conversation': (payload: { conversationId: string }) => void
  'typing:start': (payload: { conversationId: string; userName: string }) => void
  'typing:stop': (payload: { conversationId: string }) => void
}

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

// ── Singleton ─────────────────────────────────────────────────────

let socket: AppSocket | null = null
let currentToken: string | null = null

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || ''

export function getSocket(): AppSocket | null {
  return socket
}

export function connectSocket(token: string): AppSocket {
  // If already connected with same token, return existing
  if (socket?.connected && currentToken === token) {
    return socket
  }

  // Disconnect existing before creating new
  if (socket) {
    socket.disconnect()
  }

  currentToken = token

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
  })

  // Auto-refresh token on auth errors
  socket.on('connect_error', async (err) => {
    if (err.message === 'AUTH_REQUIRED' || err.message === 'AUTH_INVALID' || err.message === 'AUTH_ERROR') {
      console.warn('[socket.io] Auth error, refreshing token...')
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          currentToken = session.access_token
          socket!.auth = { token: session.access_token }
          // Socket.IO will auto-reconnect with new auth
        }
      } catch (e) {
        console.error('[socket.io] Failed to refresh token:', e)
      }
    }
  })

  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
    currentToken = null
  }
}
