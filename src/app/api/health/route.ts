import { apiSuccess, createApiMeta } from '@/lib/api-response'

export async function GET() {
  const meta = createApiMeta()
  const checks = {
    process: 'up',
    supabaseConfigured:
      Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    socketConfigured: Boolean(process.env.NEXT_PUBLIC_SOCKET_URL),
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    rateLimitConfigured:
      Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
      Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
  }

  return apiSuccess(
    {
      service: 'web',
      environment: process.env.NODE_ENV ?? 'development',
      time: meta.timestamp,
      checks,
      dependencies: {
        realtime: checks.socketConfigured ? 'socket+supabase' : 'supabase',
        rateLimit: checks.rateLimitConfigured ? 'upstash' : 'memory-fallback',
      },
    },
    { meta }
  )
}
