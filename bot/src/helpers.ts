import { supabase } from './lib/supabase'
import type { Customer, Conversation } from './lib/types'

// ─── In-memory cache to reduce DB roundtrips on repeated messages ────
const CUSTOMER_CACHE_TTL = 60_000 // 60s
const CONVERSATION_CACHE_TTL = 60_000 // 60s

const customerCache = new Map<string, { data: Customer; expires: number }>()
const conversationCache = new Map<string, { data: Conversation; expires: number }>()

function getCachedCustomer(telegramId: number, botId: string): Customer | null {
  const key = `${telegramId}:${botId}`
  const entry = customerCache.get(key)
  if (entry && Date.now() < entry.expires) return entry.data
  customerCache.delete(key)
  return null
}

function setCachedCustomer(telegramId: number, botId: string, data: Customer) {
  customerCache.set(`${telegramId}:${botId}`, { data, expires: Date.now() + CUSTOMER_CACHE_TTL })
}

function getCachedConversation(customerId: string, botId: string): Conversation | null {
  const key = `${customerId}:${botId}`
  const entry = conversationCache.get(key)
  if (entry && Date.now() < entry.expires) return entry.data
  conversationCache.delete(key)
  return null
}

function setCachedConversation(customerId: string, botId: string, data: Conversation) {
  conversationCache.set(`${customerId}:${botId}`, { data, expires: Date.now() + CONVERSATION_CACHE_TTL })
}

/**
 * Check if a message with this telegram_message_id already exists in the conversation.
 */
export async function isMessageAlreadySaved(
  conversationId: string,
  telegramMessageId: number | undefined
): Promise<boolean> {
  if (!telegramMessageId) return false

  const { data } = await supabase
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('telegram_message_id', telegramMessageId)
    .limit(1)
    .maybeSingle()

  return !!data
}

/**
 * Insert a message, silently ignoring unique constraint violations (duplicate telegram_message_id).
 */
export async function insertMessageSafe(messageData: {
  conversation_id: string
  sender_type: string
  sender_id?: string
  content?: string
  message_type: string
  media_url?: string
  telegram_message_id?: number | null
  is_sensitive?: boolean
}): Promise<boolean> {
  const { error } = await supabase.from('messages').insert(messageData)

  if (error) {
    // 23505 = unique_violation — expected for duplicate telegram messages
    if (error.code === '23505') return false
    console.error('Error inserting message:', error)
    return false
  }

  return true
}

/**
 * Find existing customer by telegram_id + bot_id or create a new one.
 */
export async function findOrCreateCustomer(
  from: {
    id: number
    username?: string
    first_name: string
    last_name?: string
  },
  botId: string,
  uuidLanding?: string
): Promise<Customer | null> {
  // Check in-memory cache first to avoid DB roundtrip on repeated messages
  const cached = getCachedCustomer(from.id, botId)
  if (cached) {
    // Fire-and-forget last_activity update (no need to wait or re-read)
    supabase.from('customers').update({ last_activity: new Date().toISOString() }).eq('id', cached.id).then()
    return cached
  }

  // Try to find existing customer for this bot
  const { data: existing } = await supabase
    .from('customers')
    .select('id, telegram_id, telegram_username, first_name, last_name, bot_id, status, casino_token, casino_user_id, casino_username, casino_profile, last_activity')
    .eq('telegram_id', from.id)
    .eq('bot_id', botId)
    .single()

  if (existing) {
    // Update info if changed
    const updates: Record<string, unknown> = {
      last_activity: new Date().toISOString(),
    }

    if (from.username !== existing.telegram_username) {
      updates.telegram_username = from.username || null
    }
    if (from.first_name !== existing.first_name) {
      updates.first_name = from.first_name || null
    }
    if (from.last_name !== existing.last_name) {
      updates.last_name = from.last_name || null
    }

    await supabase
      .from('customers')
      .update(updates)
      .eq('id', existing.id)

    const result = existing as Customer
    setCachedCustomer(from.id, botId, result)
    return result
  }

  // Create new customer
  const { data: newCustomer } = await supabase
    .from('customers')
    .insert({
      telegram_id: from.id,
      telegram_username: from.username || null,
      first_name: from.first_name || null,
      last_name: from.last_name || null,
      status: 'new',
      uuid_landing: uuidLanding || null,
      last_activity: new Date().toISOString(),
      bot_id: botId,
    })
    .select()
    .single()

  const result = (newCustomer as Customer) || null
  if (result) setCachedCustomer(from.id, botId, result)
  return result
}

/**
 * Find an open/pending conversation for a customer, or create a new one.
 */
export async function findOrCreateConversation(
  customerId: string,
  botId: string
): Promise<Conversation | null> {
  // Check in-memory cache first
  const cached = getCachedConversation(customerId, botId)
  if (cached) return cached

  const { data: existing } = await supabase
    .from('conversations')
    .select('id, customer_id, assigned_agent_id, status, last_message_at, bot_id, pending_action, ai_paused')
    .eq('customer_id', customerId)
    .eq('bot_id', botId)
    .neq('status', 'closed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existing) {
    const result = existing as Conversation
    setCachedConversation(customerId, botId, result)
    return result
  }

  const { data: newConversation } = await supabase
    .from('conversations')
    .insert({
      customer_id: customerId,
      status: 'open',
      bot_id: botId,
    })
    .select()
    .single()

  const result = (newConversation as Conversation) || null
  if (result) setCachedConversation(customerId, botId, result)
  return result
}

/**
 * Invalidate cached conversation (call when conversation state changes, e.g. pending_action).
 */
export function invalidateCachedConversation(customerId: string, botId: string) {
  conversationCache.delete(`${customerId}:${botId}`)
}

/**
 * Track if a customer message is a reply to a mass message campaign.
 * Looks for recent unreplied mass_message_recipients for this conversation
 * and marks the first one as replied, incrementing the campaign counter.
 * Fire-and-forget — errors are logged but don't interrupt the message flow.
 */
export async function trackMassMessageReply(conversationId: string): Promise<void> {
  try {
    // Find unreplied recipients for this conversation from the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: recipient, error } = await supabase
      .from('mass_message_recipients')
      .select('id, campaign_id')
      .eq('conversation_id', conversationId)
      .eq('status', 'sent')
      .is('replied_at', null)
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !recipient) return

    // Mark this recipient as replied
    const { error: updateError } = await supabase
      .from('mass_message_recipients')
      .update({ replied_at: new Date().toISOString() })
      .eq('id', recipient.id)
      .is('replied_at', null) // optimistic lock: only update if still null

    if (updateError) return

    // Increment the campaign's total_replied counter via raw SQL for atomicity
    // Fallback: use a simple update since supabase-js doesn't support increment
    const { data: campaign } = await supabase
      .from('mass_message_campaigns')
      .select('total_replied')
      .eq('id', recipient.campaign_id)
      .single()

    if (campaign) {
      await supabase
        .from('mass_message_campaigns')
        .update({ total_replied: campaign.total_replied + 1 })
        .eq('id', recipient.campaign_id)
    }
  } catch (err) {
    console.error('[trackMassMessageReply] Error:', err)
  }
}
