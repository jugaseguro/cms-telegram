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
// and blocks ALL subsequent Supabase operations. 5s is enough for any healthy refresh.
const FN_TIMEOUT_MS = 5_000
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
  try {
    // Race fn() against a timeout so a hung auth token refresh (broken network
    // after sleep/minimize) can't hold the lock indefinitely.
    return await Promise.race([
      fn(),
      new Promise<R>((_, reject) =>
        setTimeout(
          () => reject(new Error('Auth operation timed out — network likely broken')),
          FN_TIMEOUT_MS
        )
      ),
    ])
  } finally {
    resolve!()
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
 * Destroys the singleton Supabase client so the next call to createClient()
 * creates a fresh instance. Used for session recovery after device sleep.
 * Also resets the lock queue to prevent chained timeouts from a stuck previous session.
 */
export function resetClient() {
  client = null
  lockPromise = Promise.resolve()
}
