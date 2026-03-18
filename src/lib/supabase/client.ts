import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

// Simple in-process lock that serializes auth operations without
// the Navigator Lock API's 5-second timeout and AbortError issues.
// Safe with our singleton client — avoids the lock contention that
// causes the panel to freeze after idle.
let lockPromise: Promise<any> = Promise.resolve()
const LOCK_TIMEOUT_MS = 10_000

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
    return await fn()
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
