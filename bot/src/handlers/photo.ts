import { Context } from 'grammy'
import { supabase } from '../lib/supabase'
import { findOrCreateCustomer, findOrCreateConversation } from '../helpers'

export async function handlePhoto(ctx: Context) {
  const from = ctx.from
  const photo = ctx.message?.photo
  if (!from || !photo) return

  const customer = await findOrCreateCustomer(from)
  if (!customer) return

  const conversation = await findOrCreateConversation(customer.id)
  if (!conversation) return

  // Get highest resolution photo and resolve to downloadable URL
  const fileId = photo[photo.length - 1].file_id
  const file = await ctx.api.getFile(fileId)
  const telegramUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`
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

  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    sender_type: 'customer',
    sender_id: String(from.id),
    content: caption,
    message_type: 'image',
    media_url: mediaUrl,
    telegram_message_id: ctx.message?.message_id || null,
  })

  await ctx.reply('✅ Comprobante recibido. Un agente lo revisará en breve.')
}
