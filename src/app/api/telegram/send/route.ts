import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'

const MAX_RETRIES = 3
const BASE_DELAY_MS = 500

async function sendToTelegram(
  botToken: string,
  payload: { chatId: number; text?: string; mediaUrl?: string; messageType?: string }
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const { chatId, text, mediaUrl, messageType } = payload
  let response: Response
  let endpoint: string
  let body: Record<string, unknown>

  if (messageType === 'image' && mediaUrl) {
    endpoint = `https://api.telegram.org/bot${botToken}/sendPhoto`
    body = { chat_id: chatId, photo: mediaUrl, ...(text ? { caption: text } : {}) }
  } else if (messageType === 'document' && mediaUrl) {
    endpoint = `https://api.telegram.org/bot${botToken}/sendDocument`
    body = { chat_id: chatId, document: mediaUrl, ...(text ? { caption: text } : {}) }
  } else {
    if (!text) {
      return { ok: false, data: { description: 'Missing text' } }
    }
    endpoint = `https://api.telegram.org/bot${botToken}/sendMessage`
    body = { chat_id: chatId, text }
  }

  response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await response.json() as Record<string, unknown>
  return { ok: !!data.ok, data }
}

async function sendWithRetry(
  botToken: string,
  payload: { chatId: number; text?: string; mediaUrl?: string; messageType?: string }
): Promise<{ ok: boolean; data: Record<string, unknown>; attempts: number }> {
  let lastError: Record<string, unknown> = {}

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1)
      await new Promise((r) => setTimeout(r, delay))
    }

    try {
      const result = await sendToTelegram(botToken, payload)

      if (result.ok) {
        return { ok: true, data: result.data, attempts: attempt + 1 }
      }

      // Don't retry client errors (bad request, forbidden, etc.)
      const errorCode = (result.data as { error_code?: number }).error_code ?? 0
      if (errorCode >= 400 && errorCode < 500 && errorCode !== 429) {
        return { ok: false, data: result.data, attempts: attempt + 1 }
      }

      // Retry on 429 (too many requests) or 5xx server errors
      lastError = result.data
    } catch (err) {
      lastError = { description: err instanceof Error ? err.message : 'Network error' }
    }
  }

  return { ok: false, data: lastError, attempts: MAX_RETRIES + 1 }
}

export async function POST(request: Request) {
  const { chatId, text, mediaUrl, messageType } = await request.json()

  if (!chatId) {
    return NextResponse.json({ error: 'Missing chatId' }, { status: 400 })
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 })
  }

  // Rate limit by agent (authenticated user)
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const agentId = user?.id ?? 'anonymous'

  const { success, remaining, reset } = await checkRateLimit(agentId)
  if (!success) {
    return NextResponse.json(
      { error: 'Has superado el límite de 30 mensajes por minuto. Esperá un momento.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(reset),
          'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
        },
      }
    )
  }

  if (!text && !(mediaUrl && (messageType === 'image' || messageType === 'document'))) {
    return NextResponse.json({ error: 'Missing text' }, { status: 400 })
  }

  const result = await sendWithRetry(BOT_TOKEN, { chatId, text, mediaUrl, messageType })

  if (!result.ok) {
    return NextResponse.json(
      {
        error: (result.data as { description?: string }).description ?? 'Telegram delivery failed',
        attempts: result.attempts,
      },
      {
        status: 502,
        headers: { 'X-RateLimit-Remaining': String(remaining) },
      }
    )
  }

  return NextResponse.json(
    {
      success: true,
      message_id: (result.data.result as { message_id: number }).message_id,
      attempts: result.attempts,
    },
    {
      headers: { 'X-RateLimit-Remaining': String(remaining) },
    }
  )
}
