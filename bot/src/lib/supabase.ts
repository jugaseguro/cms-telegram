import { createClient } from '@supabase/supabase-js'
import { WebSocket } from 'ws'

// Polyfill WebSocket for Node.js (required by Supabase Realtime)
if (typeof globalThis.WebSocket === 'undefined') {
  ;(globalThis as any).WebSocket = WebSocket
}

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
