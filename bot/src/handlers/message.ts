import { Context } from 'grammy'
import { supabase } from '../lib/supabase'
import { findOrCreateCustomer, findOrCreateConversation } from '../helpers'
import type { AutoResponse } from '../lib/types'

export async function handleTextMessage(ctx: Context) {
  const from = ctx.from
  const text = ctx.message?.text
  if (!from || !text) return

  // Find or create customer
  const customer = await findOrCreateCustomer(from)
  if (!customer) return

  // Find or create conversation
  const conversation = await findOrCreateConversation(customer.id)
  if (!conversation) return

  // Save customer message
  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    sender_type: 'customer',
    sender_id: String(from.id),
    content: text,
    message_type: 'text',
    telegram_message_id: ctx.message?.message_id || null,
  })

  // Check for auto-response matches
  const { data: autoResponses } = await supabase
    .from('auto_responses')
    .select('*')
    .eq('is_active', true)

  if (autoResponses && autoResponses.length > 0) {
    const lowerText = text.toLowerCase()
    const match = (autoResponses as AutoResponse[]).find((ar) =>
      lowerText.includes(ar.trigger_text.toLowerCase())
    )

    if (match) {
      // Send auto-response
      await ctx.reply(match.response_text)

      // Save bot response in messages
      await supabase.from('messages').insert({
        conversation_id: conversation.id,
        sender_type: 'bot',
        content: match.response_text,
        message_type: 'text',
      })
    }
  }
}
