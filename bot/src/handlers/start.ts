import { Context } from 'grammy'
import { supabase } from '../lib/supabase'
import { findOrCreateCustomer, findOrCreateConversation } from '../helpers'

// Matches a UUID-like code (e.g. "abc-123-def" or standard UUID)
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

export async function handleStart(ctx: Context) {
  const from = ctx.from
  if (!from) return

  // Extract UUID code from /start payload (deep link parameter)
  const text = ctx.message?.text || ''
  const match = text.match(UUID_REGEX)
  const uuidLanding = match ? match[0] : undefined

  // Find or create customer
  const customer = await findOrCreateCustomer(from, uuidLanding)
  if (!customer) return

  // Find or create conversation
  const conversation = await findOrCreateConversation(customer.id)
  if (!conversation) return

  // Save the /start message
  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    sender_type: 'customer',
    sender_id: String(from.id),
    content: text,
    message_type: 'text',
    telegram_message_id: ctx.message?.message_id || null,
  })

  await ctx.reply(
    '¡Bienvenido! 👋\n\n' +
    'Estás conectado con nuestro equipo de atención.\n' +
    'Escribe tu consulta y un agente te responderá a la brevedad.'
  )
}
