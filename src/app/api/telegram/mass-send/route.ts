import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { apiError, apiSuccess, createApiMeta } from '@/lib/api-response'
import { withTimeout } from '@/lib/timeout'

// Extend function timeout so 300+ message sends don't get cut off mid-flight
export const maxDuration = 60 // seconds (requires Netlify Functions or Vercel Pro)

const MAX_RETRIES = 3
const BASE_DELAY_MS = 500
const TELEGRAM_REQUEST_TIMEOUT_MS = 12_000

const massSendSchema = z
  .object({
    labelId: z.string().uuid('labelId must be a valid UUID'),
    botId: z.string().uuid('botId must be a valid UUID'),
    text: z.string().trim().min(1).optional(),
    mediaUrl: z.string().trim().min(1).optional(),
    messageType: z.enum(['text', 'image', 'document']).optional().default('text'),
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
  const parsed = massSendSchema.safeParse(body)

  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', 'Invalid payload', {
      status: 400,
      details: parsed.error.flatten(),
      meta,
    })
  }

  const { labelId, botId, text, mediaUrl, messageType } = parsed.data
  const supabase = await createServerSupabaseClient()
  
  // Verify auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return apiError('UNAUTHORIZED', 'No autorizado', { status: 401, meta })
  }
  const agentId = user.id

  // Get Bot Token
  const { data: bot } = await supabase
    .from('bots')
    .select('token_encrypted')
    .eq('id', botId)
    .single()

  const botToken = bot?.token_encrypted || process.env.TELEGRAM_BOT_TOKEN

  if (!botToken) {
    return apiError('INTERNAL_ERROR', 'Bot token not configured', { status: 500, meta })
  }

  // Get customers via conversation_labels (labels are applied to conversations, not customers directly)
  // Step 1: find all conversations with this label
  const { data: convLabels, error: convLabelsError } = await supabase
    .from('conversation_labels')
    .select('conversation_id')
    .eq('label_id', labelId)

  if (convLabelsError || !convLabels || convLabels.length === 0) {
    return apiSuccess({ success: true, processed: 0, sent: 0, failed: 0 }, { meta })
  }

  const convIds = convLabels.map(cl => cl.conversation_id)

  // Step 2: get those conversations (filtered by bot) with their customers
  const { data: conversations, error: convsError } = await supabase
    .from('conversations')
    .select('id, customer_id, customers!inner(id, telegram_id)')
    .in('id', convIds)
    .eq('bot_id', botId)

  if (convsError || !conversations || conversations.length === 0) {
    return apiSuccess({ success: true, processed: 0, sent: 0, failed: 0 }, { meta })
  }

  // Deduplicate by customer_id (one customer may have multiple tagged conversations)
  const customerMap = new Map<string, { id: string; telegram_id: number; conversationId: string }>()
  for (const conv of conversations) {
    const cust = conv.customers as unknown as { id: string; telegram_id: number }
    if (cust && !customerMap.has(cust.id)) {
      customerMap.set(cust.id, { id: cust.id, telegram_id: cust.telegram_id, conversationId: conv.id })
    }
  }

  const customers = Array.from(customerMap.values())

  if (customers.length === 0) {
    return apiSuccess({ success: true, processed: 0, sent: 0, failed: 0 }, { meta })
  }

  let sentCount = 0
  let failedCount = 0

  // Send in parallel batches of 20 to respect Telegram's 30 msg/sec rate limit
  // 299 users / 20 per batch = ~15 batches × ~500ms each ≈ 7-10s total
  const BATCH_SIZE = 20
  const BATCH_DELAY_MS = 500 // 20 msgs/batch well under Telegram's 30 req/s limit

  type SentEntry = { conversationId: string; telegram_message_id: string | null }
  const sentEntries: SentEntry[] = []

  for (let i = 0; i < customers.length; i += BATCH_SIZE) {
    const batch = customers.slice(i, i + BATCH_SIZE)

    const batchResults = await Promise.all(
      batch
        .filter((c) => !!c.telegram_id)
        .map(async (customer) => {
          const result = await sendWithRetry(botToken, {
            chatId: customer.telegram_id,
            text,
            mediaUrl,
            messageType,
          })
          return { customer, result }
        })
    )

    for (const { customer, result } of batchResults) {
      if (result.ok) {
        sentCount++
        sentEntries.push({
          conversationId: customer.conversationId,
          telegram_message_id: (result.data.result as any)?.message_id?.toString() ?? null,
        })
      } else {
        failedCount++
      }
    }

    // Pause between batches (skip after last batch)
    if (i + BATCH_SIZE < customers.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS))
    }
  }

  // Bulk insert all sent messages into DB at once (much faster than one-by-one)
  if (sentEntries.length > 0) {
    const msgContent = text || (messageType !== 'text' ? `[${messageType}]` : '')
    await supabase.from('messages').insert(
      sentEntries.map((e) => ({
        conversation_id: e.conversationId,
        content: msgContent,
        sender_type: 'agent' as const,
        sender_id: agentId,
        message_type: messageType,
        media_url: mediaUrl,
        telegram_message_id: e.telegram_message_id ? Number(e.telegram_message_id) : null,
      }))
    )
  }

  return apiSuccess(
    {
      success: true,
      processed: customers.length,
      sent: sentCount,
      failed: failedCount,
    },
    { meta }
  )
}
