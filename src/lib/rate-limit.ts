import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const MAX_REQUESTS = 30
const WINDOW_SECONDS = 60

let ratelimit: Ratelimit | null = null

function getRatelimit(): Ratelimit | null {
  if (ratelimit) return ratelimit

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) return null

  ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(MAX_REQUESTS, `${WINDOW_SECONDS} s`),
    analytics: false,
    prefix: 'crm-telegram',
  })

  return ratelimit
}

// In-memory fallback for when Upstash is not configured
const memoryStore = new Map<string, { count: number; resetAt: number }>()

function memoryRateLimit(identifier: string): { success: boolean; remaining: number; reset: number } {
  const now = Date.now()
  const entry = memoryStore.get(identifier)

  if (!entry || now >= entry.resetAt) {
    memoryStore.set(identifier, { count: 1, resetAt: now + WINDOW_SECONDS * 1000 })
    return { success: true, remaining: MAX_REQUESTS - 1, reset: now + WINDOW_SECONDS * 1000 }
  }

  entry.count++
  const remaining = Math.max(0, MAX_REQUESTS - entry.count)
  return {
    success: entry.count <= MAX_REQUESTS,
    remaining,
    reset: entry.resetAt,
  }
}

export async function checkRateLimit(agentId: string): Promise<{
  success: boolean
  remaining: number
  reset: number
}> {
  const rl = getRatelimit()

  if (rl) {
    const result = await rl.limit(agentId)
    return {
      success: result.success,
      remaining: result.remaining,
      reset: result.reset,
    }
  }

  return memoryRateLimit(agentId)
}

export { MAX_REQUESTS, WINDOW_SECONDS }
