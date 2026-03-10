import type { BotContext } from '../bot'
import { findOrCreateCustomer, findOrCreateConversation, isMessageAlreadySaved, insertMessageSafe } from '../helpers'

// Matches a UUID-like code (e.g. "abc-123-def" or standard UUID)
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

export async function handleStart(ctx: BotContext) {
  const from = ctx.from
  if (!from) return

  // Extract UUID code from /start payload (deep link parameter)
  const text = ctx.message?.text || ''
  const match = text.match(UUID_REGEX)
  const uuidLanding = match ? match[0] : undefined

  // Find or create customer
  const customer = await findOrCreateCustomer(from, ctx.botId, uuidLanding)
  if (!customer) return

  // Find or create conversation
  const conversation = await findOrCreateConversation(customer.id, ctx.botId)
  if (!conversation) return

  // Dedup: skip if this telegram message was already saved
  if (await isMessageAlreadySaved(conversation.id, ctx.message?.message_id)) return

  // Save the /start message
  await insertMessageSafe({
    conversation_id: conversation.id,
    sender_type: 'customer',
    sender_id: String(from.id),
    content: text,
    message_type: 'text',
    telegram_message_id: ctx.message?.message_id || null,
  })

  const welcomeText = ctx.welcomeMessage ||
    '¡Bienvenido! 👋\n\n' +
    'Estás conectado con nuestro equipo de atención.\n' +
    'Escribe tu consulta y un agente te responderá a la brevedad.'

  await ctx.reply(welcomeText)
}
