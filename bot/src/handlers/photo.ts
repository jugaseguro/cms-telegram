import type { BotContext } from '../bot'
import { supabase } from '../lib/supabase'
import { findOrCreateCustomer, findOrCreateConversation, isMessageAlreadySaved, insertMessageSafe, trackMassMessageReply } from '../helpers'

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

export async function handlePhoto(ctx: BotContext) {
  const from = ctx.from
  const photo = ctx.message?.photo
  if (!from || !photo) return

  const customer = await findOrCreateCustomer(from, ctx.botId)
  if (!customer) return

  const conversation = await findOrCreateConversation(customer.id, ctx.botId)
  if (!conversation) return

  // Dedup: skip before downloading file to save bandwidth
  if (await isMessageAlreadySaved(conversation.id, ctx.message?.message_id)) return

  // Validate file size before downloading (max 5MB)
  const MAX_PHOTO_SIZE = 5 * 1024 * 1024
  const highResPhoto = photo[photo.length - 1]
  if (highResPhoto.file_size && highResPhoto.file_size > MAX_PHOTO_SIZE) {
    await ctx.reply('La imagen es demasiado grande. El máximo permitido es 5MB.')
    return
  }

  // Get highest resolution photo and resolve to downloadable URL
  const fileId = highResPhoto.file_id
  const file = await ctx.api.getFile(fileId)
  const telegramUrl = `https://api.telegram.org/file/bot${ctx.botToken}/${file.file_path}`
  const caption = ctx.message?.caption || ''

  // Download from Telegram and upload to Supabase Storage
  let mediaUrl = telegramUrl
  try {
    const response = await fetch(telegramUrl)
    const buffer = Buffer.from(await response.arrayBuffer())
    const ext = file.file_path?.split('.').pop() || 'jpg'
    const storagePath = `customer-uploads/${conversation.id}/${Date.now()}.${ext}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('chat-attachments')
      .upload(storagePath, buffer, {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
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
    message_type: 'image',
    media_url: mediaUrl,
    telegram_message_id: ctx.message?.message_id || null,
  })

  trackMassMessageReply(conversation.id).catch(() => {})

  const isPausedFromDB = await getBotPausedState(ctx.botId)
  console.log(`[photo] isPaused from DB:`, isPausedFromDB)
  if (isPausedFromDB) return

  // Default: acknowledge photo receipt for agent review
  await ctx.reply('✅ Comprobante recibido. Un agente lo revisará en breve.')
}
