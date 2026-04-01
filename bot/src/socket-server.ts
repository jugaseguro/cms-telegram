import { Server as SocketIOServer } from 'socket.io'
import type { Server as HTTPServer } from 'http'
import { supabase } from './lib/supabase'

// ── Types ──────────────────────────────────────────────────────────

interface ServerToClientEvents {
  'message:new': (payload: { message: Record<string, unknown>; conversationId: string }) => void
  'conversation:updated': (payload: { conversationId: string; event: string }) => void
  'typing:start': (payload: { conversationId: string; userId: string; userName: string }) => void
  'typing:stop': (payload: { conversationId: string; userId: string }) => void
  'presence:update': (payload: { onlineAgentIds: string[] }) => void
  'recontact:summary': (payload: { ruleName: string; botName: string; sent: number; total: number }) => void
}

interface ClientToServerEvents {
  'join:conversation': (payload: { conversationId: string }) => void
  'leave:conversation': (payload: { conversationId: string }) => void
  'typing:start': (payload: { conversationId: string; userName: string }) => void
  'typing:stop': (payload: { conversationId: string }) => void
}

interface SocketData {
  userId: string
  userRole: string
}

// ── State ──────────────────────────────────────────────────────────

let io: SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData> | null = null
const onlineAgents = new Set<string>()

// ── Public API ─────────────────────────────────────────────────────

export function getIO() {
  return io
}

export function getSocketDiagnostics() {
  return {
    initialized: Boolean(io),
    connectedClients: io?.sockets.sockets.size ?? 0,
    onlineAgents: Array.from(onlineAgents),
  }
}

export function initSocketServer(httpServer: HTTPServer) {
  const corsOrigin = process.env.SOCKET_IO_CORS_ORIGIN || '*'

  io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    cors: {
      origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((s) => s.trim()),
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25_000,
    pingTimeout: 20_000,
  })

  // ── Auth middleware ─────────────────────────────────────────────
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined
    if (!token) {
      return next(new Error('AUTH_REQUIRED'))
    }

    try {
      const { data: { user }, error } = await supabase.auth.getUser(token)
      if (error || !user) {
        return next(new Error('AUTH_INVALID'))
      }

      socket.data.userId = user.id
      socket.data.userRole = user.user_metadata?.role || 'agent'
      next()
    } catch {
      next(new Error('AUTH_ERROR'))
    }
  })

  // ── Connection handler ─────────────────────────────────────────
  io.on('connection', (socket) => {
    const userId = socket.data.userId
    console.log(`[socket.io] Agent connected: ${userId} (${socket.id})`)

    // Track presence
    onlineAgents.add(userId)
    io!.emit('presence:update', { onlineAgentIds: Array.from(onlineAgents) })

    // ── Room management ────────────────────────────────────────
    socket.on('join:conversation', ({ conversationId }) => {
      socket.join(`conversation:${conversationId}`)
      console.log(`[socket.io] ${userId} joined conversation:${conversationId}`)
    })

    socket.on('leave:conversation', ({ conversationId }) => {
      socket.leave(`conversation:${conversationId}`)
      console.log(`[socket.io] ${userId} left conversation:${conversationId}`)
    })

    // ── Typing indicators ──────────────────────────────────────
    socket.on('typing:start', ({ conversationId, userName }) => {
      socket.to(`conversation:${conversationId}`).emit('typing:start', {
        conversationId,
        userId,
        userName,
      })
    })

    socket.on('typing:stop', ({ conversationId }) => {
      socket.to(`conversation:${conversationId}`).emit('typing:stop', {
        conversationId,
        userId,
      })
    })

    // ── Disconnect ─────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`[socket.io] Agent disconnected: ${userId} (${reason})`)

      // Only remove from presence if no other sockets for this user
      const sockets = io!.sockets.sockets
      let hasOtherSocket = false
      for (const [, s] of sockets) {
        if (s.data.userId === userId && s.id !== socket.id) {
          hasOtherSocket = true
          break
        }
      }

      if (!hasOtherSocket) {
        onlineAgents.delete(userId)
        io!.emit('presence:update', { onlineAgentIds: Array.from(onlineAgents) })
      }
    })
  })

  // ── Supabase Realtime relay (server-side, service role key) ────
  setupRealtimeRelay()

  console.log(`[socket.io] Server initialized (CORS: ${corsOrigin})`)
  return io
}

// ── Supabase Realtime → Socket.IO relay ──────────────────────────

function setupRealtimeRelay() {
  // Channel for messages INSERT
  supabase
    .channel('socketio-messages-relay')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      },
      (payload) => {
        if (!io || io.sockets.sockets.size === 0) return
        const msg = payload.new as Record<string, unknown>
        const conversationId = msg.conversation_id as string

        // Send full message only to clients in the conversation room
        io.to(`conversation:${conversationId}`).emit('message:new', {
          message: msg,
          conversationId,
        })

        // Send lightweight notification globally for unread badges & sounds
        // (only conversationId + senderType, not the full message payload)
        io.emit('message:new', {
          message: { conversation_id: conversationId, sender_type: msg.sender_type },
          conversationId,
        })
      }
    )
    .subscribe((status, err) => {
      console.log(`[socket.io] Messages relay channel: ${status}`, err || '')
    })

  // Channel for conversations changes
  supabase
    .channel('socketio-conversations-relay')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversations',
      },
      (payload) => {
        if (!io || io.sockets.sockets.size === 0) return
        const conv = (payload.new || payload.old) as Record<string, unknown>
        const conversationId = conv.id as string

        io.emit('conversation:updated', {
          conversationId,
          event: payload.eventType,
        })
      }
    )
    .subscribe((status, err) => {
      console.log(`[socket.io] Conversations relay channel: ${status}`, err || '')
    })
}
