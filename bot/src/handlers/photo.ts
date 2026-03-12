import type { BotContext } from '../bot'
import { supabase } from '../lib/supabase'
import { findOrCreateCustomer, findOrCreateConversation, isMessageAlreadySaved, insertMessageSafe } from '../helpers'
import { createDeposit } from '../api/casino'
import { decryptToken } from '../lib/crypto'

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

  // -------------------------------------------------------
  // Check if there is a pending deposit awaiting this receipt
  // -------------------------------------------------------
  const pending = conversation.pending_action

  if (
    ctx.aiEnabled &&
    customer.casino_token &&
    pending?.type === 'awaiting_deposit_receipt'
  ) {
    try {
      await ctx.replyWithChatAction('typing')
      await ctx.reply('📤 Procesando comprobante...')

      // Download the image and convert to base64
      const imgResponse = await fetch(telegramUrl)
      const imgBuffer = Buffer.from(await imgResponse.arrayBuffer())
      if (imgBuffer.length > MAX_PHOTO_SIZE) {
        await ctx.reply('El comprobante es demasiado grande para procesar. Intentá con una imagen más pequeña.')
        return
      }
      const proofBase64 = `data:image/jpeg;base64,${imgBuffer.toString('base64')}`

      const result = await createDeposit(decryptToken(customer.casino_token), {
        amount: pending.amount as number,
        firstName: pending.first_name as string,
        lastName: pending.last_name as string,
        taxId: pending.tax_id as string,
        email: pending.email as string,
        paymentId: pending.payment_id as string,
        proofBase64,
      })

      // Clear pending action regardless of outcome
      await supabase
        .from('conversations')
        .update({ pending_action: null })
        .eq('id', conversation.id)

      if (result) {
        const confirmMsg = `¡Listo, lo recibí! 🙌 Ya mandé el comprobante para que lo procesen. En unos minutos debería acreditarse el saldo en tu cuenta.\n\nSi en un rato no ves el cambio, avisame y lo revisamos juntos. ¿Hay algo más en lo que te pueda ayudar?`
        await ctx.reply(confirmMsg)

        // Insert bot reply + system notification for agents
        await supabase.from('messages').insert([
          {
            conversation_id: conversation.id,
            sender_type: 'bot',
            content: confirmMsg,
            message_type: 'text',
          },
          {
            conversation_id: conversation.id,
            sender_type: 'bot',
            content: `🧾 Comprobante de depósito recibido — $${(pending.amount as number).toLocaleString('es-AR')} ARS — esperando aprobación del equipo`,
            message_type: 'text',
          },
        ])

        // Move conversation to pending so agents see it in the queue
        await supabase
          .from('conversations')
          .update({ status: 'pending' })
          .eq('id', conversation.id)
      } else {
        const errorMsg = 'Mmm, algo falló al procesar el comprobante 😕 No te preocupes, lo va a revisar un agente del equipo y te contactan a la brevedad.'
        await ctx.reply(errorMsg)
        await supabase.from('messages').insert({
          conversation_id: conversation.id,
          sender_type: 'bot',
          content: errorMsg,
          message_type: 'text',
        })
      }
    } catch (err) {
      console.error('[photo handler] Deposit error:', err)
      await ctx.reply('Hubo un error procesando el comprobante. Un agente lo revisará.').catch(() => {})
    }
    return
  }

  // Default: acknowledge photo receipt for agent review
  await ctx.reply('✅ Comprobante recibido. Un agente lo revisará en breve.')
}
