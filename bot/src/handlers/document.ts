import type { BotContext } from '../bot'
import { supabase } from '../lib/supabase'
import { findOrCreateCustomer, findOrCreateConversation, isMessageAlreadySaved, insertMessageSafe, trackMassMessageReply } from '../helpers'

export async function handleDocument(ctx: BotContext) {
  const from = ctx.from
  const document = ctx.message?.document
  if (!from || !document) return

  const customer = await findOrCreateCustomer(from, ctx.botId)
  if (!customer) return

  const conversation = await findOrCreateConversation(customer.id, ctx.botId)
  if (!conversation) return

  // Dedup: skip before downloading file to save bandwidth
  if (await isMessageAlreadySaved(conversation.id, ctx.message?.message_id)) return

  // Resolve file_id to downloadable URL
  const file = await ctx.api.getFile(document.file_id)
  const telegramUrl = `https://api.telegram.org/file/bot${ctx.botToken}/${file.file_path}`
  const caption = ctx.message?.caption || document.file_name || ''

  // Download from Telegram and upload to Supabase Storage
  let mediaUrl = telegramUrl
  try {
    const response = await fetch(telegramUrl)
    const buffer = Buffer.from(await response.arrayBuffer())
    const ext = file.file_path?.split('.').pop() || 'bin'
    const storagePath = `customer-uploads/${conversation.id}/${Date.now()}.${ext}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('chat-attachments')
      .upload(storagePath, buffer, {
        contentType: document.mime_type || 'application/octet-stream',
      })

    if (!uploadError && uploadData) {
      const { data: urlData } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(uploadData.path)
      mediaUrl = urlData.publicUrl
    }
  } catch {
    // Fallback to Telegram CDN URL if upload fails
  }

  await insertMessageSafe({
    conversation_id: conversation.id,
    sender_type: 'customer',
    sender_id: String(from.id),
    content: caption,
    message_type: 'document',
    media_url: mediaUrl,
    telegram_message_id: ctx.message?.message_id || null,
  })

  // Fire-and-forget: track if this is a reply to a mass message campaign
  trackMassMessageReply(conversation.id).catch(() => {})

  await ctx.reply('✅ Documento recibido. Un agente lo revisará en breve.')
}
