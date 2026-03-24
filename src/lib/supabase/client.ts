import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

// Simple in-process lock that serializes auth operations without
// the Navigator Lock API's 5-second timeout and AbortError issues.
// Safe with our singleton client — avoids the lock contention that
// causes the panel to freeze after idle.
// Timeout for waiting to acquire the lock (previous operation finishes)
// Keep short — multiple visibility handlers queue auth ops simultaneously after sleep.
const LOCK_TIMEOUT_MS = 3_000
// Timeout for the auth operation itself (token refresh HTTP request)
// When the network is broken after device sleep, the refresh request hangs forever
// and blocks ALL subsequent Supabase operations. 10s allows for slow networks
// while still unblocking the UI if the request is truly stuck.
const FN_TIMEOUT_MS = 10_000
let lockPromise: Promise<any> = Promise.resolve()

async function inProcessLock<R>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>
): Promise<R> {
  const previous = lockPromise
  let resolve: () => void
  lockPromise = new Promise<void>((r) => { resolve = r })
  try {
    await Promise.race([
      previous,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Lock timeout')), LOCK_TIMEOUT_MS)
      ),
    ])
  } catch {
    // ignore errors from previous operation or timeout
  }
  let lockReleased = false
  const releaseLock = () => {
    if (!lockReleased) {
      lockReleased = true
      resolve!()
    }
  }
  // Safety timer: if the auth operation hangs (broken network after sleep),
  // release the lock so other Supabase operations aren't blocked.
  // We DON'T reject — that causes unhandled rejections in Supabase's
  // internal auth code and crashes the Next.js dev error overlay.
  // The caller's own timeouts (FETCH_TIMEOUT_MS, TanStack Query retry)
  // handle truly dead requests.
  const safetyTimer = setTimeout(() => {
    console.warn('[Supabase Lock] Auth operation slow — releasing lock after', FN_TIMEOUT_MS, 'ms')
    releaseLock()
  }, FN_TIMEOUT_MS)
  try {
    return await fn()
  } finally {
    clearTimeout(safetyTimer)
    releaseLock()
  }
}

let client: ReturnType<typeof createBrowserClient<Database>> | null = null

export function createClient() {
  if (!client) {
    client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          lock: inProcessLock,
        },
      }
    )
  }
  return client
}

/**
 * Resets the lock queue to prevent chained timeouts from a stuck auth operation.
 * Called during session recovery after device sleep.
 */
export function resetLockQueue() {
  lockPromise = Promise.resolve()
}

/**
 * Destroys the singleton Supabase client so the next call to createClient()
 * creates a fresh instance. Used for session recovery after device sleep.
 */
export function resetClient() {
  client = null
  resetLockQueue()
}
