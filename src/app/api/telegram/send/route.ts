import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { withTimeout } from '@/lib/timeout'
import { apiError, apiSuccess, createApiMeta } from '@/lib/api-response'

const MAX_RETRIES = 3
const BASE_DELAY_MS = 500
const TELEGRAM_REQUEST_TIMEOUT_MS = 12_000

const sendTelegramSchema = z
  .object({
    chatId: z.coerce.number().int().positive('chatId must be a positive integer'),
    text: z.string().trim().min(1).optional(),
    mediaUrl: z.string().trim().min(1).optional(),
    messageType: z.enum(['text', 'image', 'document']).optional(),
    botId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    const hasMedia = Boolean(data.mediaUrl && data.messageType && data.messageType !== 'text')
    if (!data.text && !hasMedia) {
      ctx.addIssue({
        code: 'custom',
        message: 'Either text or media payload is required',
        path: ['text'],
      })
    }
  })

async function sendToTelegram(
  botToken: string,
  payload: { chatId: number; text?: string; mediaUrl?: string; messageType?: string }
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const { chatId, text, mediaUrl, messageType } = payload
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

  const response = await withTimeout(
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    TELEGRAM_REQUEST_TIMEOUT_MS,
    'TELEGRAM_API_TIMEOUT'
  )

  const data = (await response.json()) as Record<string, unknown>
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
      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    try {
      const result = await sendToTelegram(botToken, payload)

      if (result.ok) {
        return { ok: true, data: result.data, attempts: attempt + 1 }
      }

      const errorCode = (result.data as { error_code?: number }).error_code ?? 0
      if (errorCode >= 400 && errorCode < 500 && errorCode !== 429) {
        return { ok: false, data: result.data, attempts: attempt + 1 }
      }

      lastError = result.data
    } catch (err) {
      lastError = { description: err instanceof Error ? err.message : 'Network error' }
    }
  }

  return { ok: false, data: lastError, attempts: MAX_RETRIES + 1 }
}

export async function POST(request: Request) {
  const meta = createApiMeta()
  const body = await request.json().catch(() => null)
  const parsed = sendTelegramSchema.safeParse(body)

  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', 'Invalid telegram payload', {
      status: 400,
      details: parsed.error.flatten(),
      meta,
    })
  }

  const { chatId, text, mediaUrl, messageType, botId } = parsed.data
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const agentId = user?.id ?? 'anonymous'

  const { success, remaining, reset } = await checkRateLimit(agentId)
  if (!success) {
    return apiError('RATE_LIMITED', 'Has superado el límite de 30 mensajes por minuto. Esperá un momento.', {
      status: 429,
      headers: {
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(reset),
        'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
      },
      meta,
    })
  }

  let botToken: string | undefined
  if (botId) {
    const { data: bot } = await supabase
      .from('bots')
      .select('token_encrypted')
      .eq('id', botId)
      .single()

    botToken = bot?.token_encrypted
  }

  if (!botToken) {
    botToken = process.env.TELEGRAM_BOT_TOKEN
  }

  if (!botToken) {
    return apiError('INTERNAL_ERROR', 'Bot token not configured', { status: 500, meta })
  }

  const result = await sendWithRetry(botToken, { chatId, text, mediaUrl, messageType })

  if (!result.ok) {
    const message = (result.data as { description?: string }).description ?? 'Telegram delivery failed'
    const code = message.includes('TIMEOUT') ? 'TIMEOUT' : 'DEPENDENCY_FAILURE'
    return apiError(code, message, {
      status: 502,
      headers: { 'X-RateLimit-Remaining': String(remaining) },
      details: { attempts: result.attempts },
      meta,
    })
  }

  return apiSuccess(
    {
      success: true,
      message_id: (result.data.result as { message_id: number }).message_id,
      attempts: result.attempts,
    },
    {
      meta,
      headers: { 'X-RateLimit-Remaining': String(remaining) },
    }
  )
}
