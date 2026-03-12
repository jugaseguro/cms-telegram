import { supabase } from './lib/supabase'
import type { Customer, Conversation } from './lib/types'

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
  // Try to find existing customer for this bot
  const { data: existing } = await supabase
    .from('customers')
    .select('*')
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

    return existing as Customer
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

  return (newCustomer as Customer) || null
}

/**
 * Find an open/pending conversation for a customer, or create a new one.
 */
export async function findOrCreateConversation(
  customerId: string,
  botId: string
): Promise<Conversation | null> {
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('customer_id', customerId)
    .eq('bot_id', botId)
    .neq('status', 'closed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existing) {
    return existing as Conversation
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

  return (newConversation as Conversation) || null
}
