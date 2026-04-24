import type { BotContext } from '../bot'
import { supabase } from '../lib/supabase'
import { findOrCreateCustomer, findOrCreateConversation, isMessageAlreadySaved, insertMessageSafe } from '../helpers'
import { menuStart } from '../keyboards'

async function getBotPausedState(botId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('bots')
      .select('is_paused')
      .eq('id', botId)
      .single()
    if (error) return false
    return data?.is_paused ?? false
  } catch { return false }
}

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

  // If the bot is globally paused, we don't reply with the welcome or menu
  const isPausedFromDB = await getBotPausedState(ctx.botId)
  console.log(`[start] isPaused from DB:`, isPausedFromDB)
  if (isPausedFromDB) return

  const welcomeText = ctx.welcomeMessage ||
    '🎉 ¡Bienvenido a 1xClub! 1xclub.bet\n\n' +
    'Te contamos las promos disponibles para empezar a jugar:\n\n' +
    '💰 Cargando $1.500\n' +
    '* Jugás sin bonificación\n\n' +
    '🚀 Cargando $3.000\n' +
    '* Recibís 30% de bono extra\n\n' +
    '📌 El bono es promocional y no es retirable.\n\n' +
    'Para crearte el usuario envianos tu apodo (nickname) y te lo activamos enseguida para que puedas comenzar a jugar.\n\n' +
    'Si querés cargar o tenés alguna duda, escribinos y te ayudamos al instante. 🍀'

  const sent = await ctx.reply(welcomeText)

  // Save the welcome message so it appears in the CMS
  await insertMessageSafe({
    conversation_id: conversation.id,
    sender_type: 'bot',
    sender_id: ctx.botId,
    content: welcomeText,
    message_type: 'text',
    telegram_message_id: sent.message_id,
  })

  // Send action buttons so the user knows what to do next
  const menuText = '¿Qué te gustaría hacer?'
  const menuSent = await ctx.reply(menuText, { reply_markup: menuStart() })

  await insertMessageSafe({
    conversation_id: conversation.id,
    sender_type: 'bot',
    sender_id: ctx.botId,
    content: menuText,
    message_type: 'text',
    telegram_message_id: menuSent.message_id,
  })
}
