import type { BotContext } from '../bot'
import { supabase } from '../lib/supabase'
import { findOrCreateCustomer, findOrCreateConversation, isMessageAlreadySaved, insertMessageSafe } from '../helpers'
import type { AutoResponse } from '../lib/types'
import { buildHistory, callAI, checkRateLimit } from '../ai/openai'
import { loginCasino, registerCasino, getBalance, createDeposit, createWithdrawal, getTransactions, CasinoAuthError } from '../api/casino'
import { encryptToken, decryptToken } from '../lib/crypto'
import { randomUUID } from 'crypto'

// -------------------------------------------------------
// Prompt injection filter — blocks before calling OpenAI
// -------------------------------------------------------

const INJECTION_PATTERNS = [
  /ignora.*(instrucciones|anteriores|prompt)/i,
  /olvida.*(instrucciones|anteriores)/i,
  /ignore.*(previous|instructions|above)/i,
  /you are now/i,
  /act\s*as\s*(if|a|an)/i,
  /actúa\s*como/i,
  /pretend\s+(you|to)/i,
  /override.*system/i,
  /jailbreak/i,
  /do\s*anything\s*now/i,
  /dan\s+mode/i,
]

function detectsInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(text))
}

// -------------------------------------------------------
// Arg validation helpers
// -------------------------------------------------------

function validateDepositArgs(args: Record<string, unknown>): string | null {
  const amount = Number(args.amount)
  if (isNaN(amount) || amount < 100 || amount > 500000)
    return 'El monto debe estar entre $100 y $500.000 ARS.'
  if (typeof args.first_name !== 'string' || args.first_name.trim().length < 2)
    return 'El nombre debe tener al menos 2 caracteres.'
  if (typeof args.last_name !== 'string' || args.last_name.trim().length < 2)
    return 'El apellido debe tener al menos 2 caracteres.'
  if (typeof args.tax_id !== 'string' || !/^\d{8,11}$/.test(args.tax_id.trim()))
    return 'El DNI/CUIL/CUIT debe tener entre 8 y 11 dígitos numéricos.'
  if (typeof args.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.email))
    return 'El email no parece válido. ¿Podés revisarlo?'
  return null
}

function validateWithdrawArgs(args: Record<string, unknown>): string | null {
  const amount = Number(args.amount)
  if (isNaN(amount) || amount < 100 || amount > 500000)
    return 'El monto debe estar entre $100 y $500.000 ARS.'
  if (typeof args.cbu !== 'string' || !/^\d{22}$/.test(args.cbu.trim()))
    return 'El CBU debe tener exactamente 22 dígitos.'
  if (typeof args.cuit !== 'string' || args.cuit.trim().length < 7)
    return 'El DNI/CUIL/CUIT debe tener al menos 7 caracteres.'
  if (typeof args.account_holder !== 'string' || args.account_holder.trim().length < 4)
    return 'El nombre del titular debe tener al menos 4 caracteres.'
  return null
}

// -------------------------------------------------------
// Handler
// -------------------------------------------------------

export async function handleTextMessage(ctx: BotContext) {
  const from = ctx.from
  const text = ctx.message?.text
  if (!from || !text) return

  // Find or create customer
  const customer = await findOrCreateCustomer(from, ctx.botId)
  if (!customer) return

  // Find or create conversation
  const conversation = await findOrCreateConversation(customer.id, ctx.botId)
  if (!conversation) return

  // Dedup check
  if (await isMessageAlreadySaved(conversation.id, ctx.message?.message_id)) return

  // -------------------------------------------------------
  // SECURITY: Intercept password BEFORE saving to DB or OpenAI
  // -------------------------------------------------------
  if (ctx.aiEnabled && conversation.pending_action?.type === 'awaiting_password') {
    const casinoUsername = conversation.pending_action.casino_username as string
    const operator = ctx.casinoOperator ?? 'DEFAULT'

    // Clear pending_action immediately
    await supabase
      .from('conversations')
      .update({ pending_action: null })
      .eq('id', conversation.id)

    // Do NOT save the password message to DB
    try {
      const loginResult = await loginCasino(casinoUsername, text, from.id, from.username, operator)

      if (!loginResult) {
        await sendBotReply(ctx, conversation.id, 'Usuario o contraseña incorrectos. ¿Querés intentar de nuevo? Enviame tu usuario.')
        return
      }

      await supabase
        .from('customers')
        .update({
          casino_token: encryptToken(loginResult.jwt),
          casino_username: casinoUsername,
          casino_profile: loginResult.profile as any,
        })
        .eq('id', customer.id)

      const firstName = (loginResult.profile.name as string)?.split(' ')[0] || casinoUsername
      await sendBotReply(ctx, conversation.id, `¡Listo, ${firstName}! Sesión iniciada correctamente. ¿En qué te puedo ayudar?`)
    } catch (err) {
      if (err instanceof CasinoAuthError) {
        await sendBotReply(ctx, conversation.id, 'Credenciales inválidas. Verificá tu usuario y contraseña e intentá de nuevo.')
      } else {
        await sendBotReply(ctx, conversation.id, 'Hubo un error al iniciar sesión. Intentá de nuevo en un momento.')
      }
    }
    return
  }

  // -------------------------------------------------------
  // SECURITY: Intercept register password BEFORE saving to DB or OpenAI
  // -------------------------------------------------------
  if (ctx.aiEnabled && conversation.pending_action?.type === 'awaiting_register_password') {
    const pending = conversation.pending_action

    if (text.length < 8 || text.length > 30) {
      await sendBotReply(ctx, conversation.id, 'La contraseña debe tener entre 8 y 30 caracteres. Intentá con otra.')
      return
    }

    // Show confirmation before registering
    await supabase
      .from('conversations')
      .update({ pending_action: { type: 'awaiting_register_confirm', username: pending.username, password: text } })
      .eq('id', conversation.id)

    await sendBotReply(ctx, conversation.id, `Confirmá tus datos:\n\n👤 Usuario: ${pending.username}\n🔑 Contraseña: ${text}\n\n¿Está todo bien? (sí/no)`)
    return
  }

  // -------------------------------------------------------
  // REGISTER: Confirmation step
  // -------------------------------------------------------
  if (ctx.aiEnabled && conversation.pending_action?.type === 'awaiting_register_confirm') {
    const pending = conversation.pending_action
    const lower = text.toLowerCase().trim()

    const YES = /^(s[ií]|si|sí|dale|ok|okey|bueno|claro|obvio|sip|sep|afirmativo|ya|confirmo|confirmar)/
    const NO = /^(no|nah|nel|cancel|mejor\s*no|nop|paso|na|cambiar)/

    if (NO.test(lower)) {
      await supabase
        .from('conversations')
        .update({ pending_action: { type: 'awaiting_register_password', username: pending.username } })
        .eq('id', conversation.id)

      await sendBotReply(ctx, conversation.id, 'OK, elegí otra contraseña (entre 8 y 30 caracteres).')
      return
    }

    if (!YES.test(lower)) {
      await sendBotReply(ctx, conversation.id, 'Respondé "sí" para confirmar o "no" para cambiar la contraseña.')
      return
    }

    const operator = ctx.casinoOperator ?? 'DEFAULT'

    await supabase
      .from('conversations')
      .update({ pending_action: null })
      .eq('id', conversation.id)

    try {
      const success = await registerCasino({
        username: pending.username as string,
        password: pending.password as string,
        operator,
      })

      if (success) {
        // Auto-login after successful registration
        const loginResult = await loginCasino(
          pending.username as string,
          pending.password as string,
          from.id,
          from.username,
          operator,
        )

        if (loginResult) {
          await supabase
            .from('customers')
            .update({
              casino_username: pending.username as string,
              casino_token: encryptToken(loginResult.jwt),
              casino_profile: loginResult.profile as any,
            })
            .eq('id', customer.id)

          await sendBotReply(ctx, conversation.id,
            `¡Cuenta creada e iniciaste sesión, ${pending.username}! 🎉\n\n` +
            `¿Qué querés hacer?\n` +
            `💰 Ver mi saldo\n` +
            `📥 Depositar\n` +
            `📤 Retirar\n` +
            `📋 Ver mis movimientos\n` +
            `👤 Hablar con un agente`)
        } else {
          await supabase
            .from('customers')
            .update({ casino_username: pending.username as string })
            .eq('id', customer.id)

          await sendBotReply(ctx, conversation.id, `¡Cuenta creada exitosamente, ${pending.username}! 🎉\n\nYa podés iniciar sesión con tu usuario y contraseña.`)
        }
      } else {
        await sendBotReply(ctx, conversation.id, 'No pude crear la cuenta. Intentá de nuevo en un momento.')
      }
    } catch (err: any) {
      if (err.message === 'casino_user_exists') {
        // Keep password, ask for new username only
        await supabase
          .from('conversations')
          .update({ pending_action: { type: 'awaiting_register_new_username', password: pending.password } })
          .eq('id', conversation.id)

        await sendBotReply(ctx, conversation.id, 'Ese usuario ya está en uso. Elegí otro nombre de usuario (tu contraseña se mantiene).')
      } else if (err.message === 'casino_password_invalid') {
        await supabase
          .from('conversations')
          .update({ pending_action: { type: 'awaiting_register_password', username: pending.username } })
          .eq('id', conversation.id)

        await sendBotReply(ctx, conversation.id, 'La contraseña no es válida. Debe tener entre 8 y 30 caracteres. Intentá con otra.')
      } else {
        await sendBotReply(ctx, conversation.id, 'Hubo un error al crear la cuenta. Intentá de nuevo en un momento.')
      }
    }
    return
  }

  // -------------------------------------------------------
  // REGISTER: New username after duplicate (password preserved)
  // -------------------------------------------------------
  if (ctx.aiEnabled && conversation.pending_action?.type === 'awaiting_register_new_username') {
    const pending = conversation.pending_action
    const username = text.trim()

    if (!username || username.length < 4 || username.includes(' ')) {
      await sendBotReply(ctx, conversation.id, 'El usuario debe tener al menos 4 caracteres y no puede contener espacios. Probá con otro.')
      return
    }

    // Show confirmation with new username + saved password
    await supabase
      .from('conversations')
      .update({ pending_action: { type: 'awaiting_register_confirm', username, password: pending.password } })
      .eq('id', conversation.id)

    await sendBotReply(ctx, conversation.id, `Confirmá tus datos:\n\n👤 Usuario: ${username}\n🔑 Contraseña: ${pending.password}\n\n¿Está todo bien? (sí/no)`)
    return
  }

  // -------------------------------------------------------
  // Handle agent confirmation response
  // -------------------------------------------------------
  if (conversation.pending_action?.type === 'awaiting_agent_confirmation') {
    const lower = text.toLowerCase().trim()

    const YES_PATTERNS = /^(s[ií]|si|sí|dale|ok|okey|bueno|por\s*favor|quiero|agente|humano|seguro|claro|obvio|ya|sip|sep|afirmativo|porfa|porfavor|por\s*fa)/
    const NO_PATTERNS = /^(no|nah|nel|segu[ií]|continua|continú?a|cancel|mejor\s*no|dejá|deja|nop|paso|na)/

    if (YES_PATTERNS.test(lower)) {
      await supabase
        .from('conversations')
        .update({ status: 'waiting_agent', ai_paused: true, pending_action: null })
        .eq('id', conversation.id)

      await insertMessageSafe({
        conversation_id: conversation.id,
        sender_type: 'customer',
        sender_id: String(from.id),
        content: text,
        message_type: 'text',
        telegram_message_id: ctx.message?.message_id || null,
      })

      await sendBotReply(ctx, conversation.id, 'Listo, ya te conecto con un agente. En breve alguien te va a atender. ¡Gracias por tu paciencia!')
      return
    }

    if (NO_PATTERNS.test(lower)) {
      await supabase
        .from('conversations')
        .update({ pending_action: null })
        .eq('id', conversation.id)

      await insertMessageSafe({
        conversation_id: conversation.id,
        sender_type: 'customer',
        sender_id: String(from.id),
        content: text,
        message_type: 'text',
        telegram_message_id: ctx.message?.message_id || null,
      })

      await sendBotReply(ctx, conversation.id, 'Perfecto, seguimos acá. ¿En qué más puedo ayudarte?')
      return
    }

    // Ambiguous — ask again
    await insertMessageSafe({
      conversation_id: conversation.id,
      sender_type: 'customer',
      sender_id: String(from.id),
      content: text,
      message_type: 'text',
      telegram_message_id: ctx.message?.message_id || null,
    })

    await sendBotReply(ctx, conversation.id, 'No te entendí bien. ¿Querés que te conecte con un agente humano? Respondé "sí" o "no".')
    return
  }

  // Save customer message (normal flow — not a password)
  await insertMessageSafe({
    conversation_id: conversation.id,
    sender_type: 'customer',
    sender_id: String(from.id),
    content: text,
    message_type: 'text',
    telegram_message_id: ctx.message?.message_id || null,
  })

  // -------------------------------------------------------
  // AI path
  // -------------------------------------------------------
  if (ctx.aiEnabled && conversation.ai_paused) {
    // Bot is paused by an agent — save message but don't process with AI
    return
  }

  if (ctx.aiEnabled) {
    // Injection filter — block before calling OpenAI
    if (detectsInjection(text)) {
      await ctx.reply('No puedo procesar ese mensaje.')
      return
    }

    // Rate limit check (persistent via Supabase)
    if (!await checkRateLimit(from.id, ctx.botId)) {
      await ctx.reply('Estás enviando mensajes muy rápido. Esperá un momento antes de continuar.')
      return
    }

    try {
      await ctx.replyWithChatAction('typing')

      const history = await buildHistory(conversation.id, ctx.aiMaxHistory)
      const systemPrompt = ctx.aiSystemPrompt ?? 'Eres un asistente virtual amigable. Responde en el mismo idioma que el usuario.'

      const result = await callAI({
        systemPrompt,
        history,
        userMessage: text,
        model: ctx.aiModel,
      })

      // Save AI usage to DB (fire and forget — don't block the response)
      supabase.from('ai_usage_logs').insert({
        conversation_id: conversation.id,
        bot_id: ctx.botId,
        model: result.usage.model,
        prompt_tokens: result.usage.prompt_tokens,
        completion_tokens: result.usage.completion_tokens,
        total_tokens: result.usage.total_tokens,
        cost_usd: result.usage.cost_usd,
      }).then(({ error }) => {
        if (error) console.error('[ai-usage] Failed to save usage log:', error.message)
      })

      if (result.type === 'text') {
        await sendBotReply(ctx, conversation.id, result.content)
        return
      }

      const { name, args } = result

      // ---- request_login ----
      // Password is collected securely in the NEXT message, never via OpenAI
      if (name === 'request_login') {
        const username = (args.username as string)?.trim()
        if (!username) {
          await sendBotReply(ctx, conversation.id, 'Necesito tu nombre de usuario. ¿Cuál es?')
          return
        }

        await supabase
          .from('conversations')
          .update({ pending_action: { type: 'awaiting_password', casino_username: username } })
          .eq('id', conversation.id)

        await sendBotReply(ctx, conversation.id, `Perfecto. Ahora enviame tu contraseña para ${username}.`)
        return
      }

      // ---- request_register ----
      if (name === 'request_register') {
        const username = (args.username as string)?.trim()

        if (!username) {
          await sendBotReply(ctx, conversation.id, '¿Qué usuario querés usar para tu cuenta?')
          return
        }
        if (username.length < 4 || username.includes(' ')) {
          await sendBotReply(ctx, conversation.id, 'El usuario debe tener al menos 4 caracteres y no puede contener espacios. ¿Probás con otro?')
          return
        }

        await supabase
          .from('conversations')
          .update({ pending_action: { type: 'awaiting_register_password', username } })
          .eq('id', conversation.id)

        await sendBotReply(ctx, conversation.id, `Perfecto, casi listo! Ahora elegí una contraseña para tu cuenta (entre 8 y 30 caracteres).`)
        return
      }

      // ---- get_balance ----
      if (name === 'get_balance') {
        if (!customer.casino_token) {
          await sendBotReply(ctx, conversation.id, 'Primero necesitás iniciar sesión. ¿Cuál es tu usuario del casino?')
          return
        }
        try {
          const balance = await getBalance(decryptToken(customer.casino_token), customer.casino_user_id ?? '')
          if (balance === null) {
            await sendBotReply(ctx, conversation.id, 'No pude obtener tu saldo en este momento. Intentá de nuevo más tarde.')
          } else {
            await sendBotReply(ctx, conversation.id, `Tu saldo actual es: $${balance.toLocaleString('es-AR')} ARS`)
          }
        } catch (err) {
          if (err instanceof CasinoAuthError) await handleExpiredToken(ctx, customer.id, conversation.id)
          else throw err
        }
        return
      }

      // ---- create_deposit ----
      if (name === 'create_deposit') {
        if (!customer.casino_token) {
          await sendBotReply(ctx, conversation.id, 'Primero necesitás iniciar sesión. ¿Cuál es tu usuario del casino?')
          return
        }

        const validationError = validateDepositArgs(args)
        if (validationError) {
          await sendBotReply(ctx, conversation.id, validationError)
          return
        }

        const pendingAction = {
          type: 'awaiting_deposit_receipt',
          amount: Number(args.amount),
          first_name: (args.first_name as string).trim(),
          last_name: (args.last_name as string).trim(),
          tax_id: (args.tax_id as string).trim(),
          email: (args.email as string).trim(),
          payment_id: randomUUID().replace(/-/g, '').slice(0, 24),
        }

        await supabase
          .from('conversations')
          .update({ pending_action: pendingAction })
          .eq('id', conversation.id)

        const monto = Number(args.amount).toLocaleString('es-AR')
        const firstName = (args.first_name as string).trim()
        const msg = `¡Perfecto, ${firstName}! Ya generé la orden de depósito por $${monto} ARS a tu nombre 😊\n\nAhora solo necesito que me mandes el comprobante de la transferencia y lo proceso enseguida. Acordate que tiene que ser por exactamente $${monto} ARS, si el monto no coincide no va a poder acreditarse.\n\n¡Mandame la foto del comprobante cuando puedas!`
        await sendBotReply(ctx, conversation.id, msg)
        return
      }

      // ---- create_withdrawal ----
      if (name === 'create_withdrawal') {
        if (!customer.casino_token) {
          await sendBotReply(ctx, conversation.id, 'Primero necesitás iniciar sesión. ¿Cuál es tu usuario del casino?')
          return
        }

        const validationError = validateWithdrawArgs(args)
        if (validationError) {
          await sendBotReply(ctx, conversation.id, validationError)
          return
        }

        try {
          const success = await createWithdrawal(decryptToken(customer.casino_token), {
            amount: Number(args.amount),
            cbu: (args.cbu as string).trim(),
            cuitl: (args.cuit as string).trim(),
            accountHolder: (args.account_holder as string).trim(),
          })

          if (success) {
            await sendBotReply(ctx, conversation.id, `✅ Retiro solicitado correctamente por $${Number(args.amount).toLocaleString('es-AR')} ARS. Será procesado en breve.`)
          } else {
            await sendBotReply(ctx, conversation.id, 'No pude procesar el retiro en este momento. Intentá de nuevo o contactá a un agente.')
          }
        } catch (err) {
          if (err instanceof CasinoAuthError) await handleExpiredToken(ctx, customer.id, conversation.id)
          else throw err
        }
        return
      }

      // ---- get_transactions ----
      if (name === 'get_transactions') {
        if (!customer.casino_token) {
          await sendBotReply(ctx, conversation.id, 'Primero necesitás iniciar sesión. ¿Cuál es tu usuario del casino?')
          return
        }

        try {
          const transactions = await getTransactions(decryptToken(customer.casino_token))

          if (transactions.length === 0) {
            await sendBotReply(ctx, conversation.id, 'No encontré movimientos registrados en tu cuenta.')
            return
          }

          const lines = transactions.slice(0, 5).map((t) => {
            const tipo = t.t || 'Movimiento'
            const estado = t.st || '---'
            const monto = t.a ? `$${t.a.toLocaleString('es-AR')} ARS` : '---'
            const fecha = t.cat ? new Date(t.cat).toLocaleDateString('es-AR') : '---'
            return `• ${tipo} | ${estado} | ${monto} | ${fecha}`
          })

          await sendBotReply(ctx, conversation.id, `Tus últimos movimientos:\n\n${lines.join('\n')}`)
        } catch (err) {
          if (err instanceof CasinoAuthError) await handleExpiredToken(ctx, customer.id, conversation.id)
          else throw err
        }
        return
      }

      // ---- transfer_to_agent ----
      if (name === 'transfer_to_agent') {
        await supabase
          .from('conversations')
          .update({ pending_action: { type: 'awaiting_agent_confirmation' } })
          .eq('id', conversation.id)

        await sendBotReply(ctx, conversation.id, '¿Estás seguro de que querés hablar con un agente humano? Puedo seguir ayudándote yo si preferís 😊')
        return
      }
    } catch (err) {
      console.error('[AI handler] Error:', err)
      await ctx.reply('Hubo un problema procesando tu mensaje. Intentá de nuevo en un momento.').catch(() => {})
    }
    return
  }

  // -------------------------------------------------------
  // Fallback: keyword-based auto-responses (AI disabled)
  // -------------------------------------------------------
  const { data: autoResponses } = await supabase
    .from('auto_responses')
    .select('*')
    .eq('is_active', true)
    .or(`bot_id.is.null,bot_id.eq.${ctx.botId}`)

  if (autoResponses && autoResponses.length > 0) {
    const lowerText = text.toLowerCase()
    const match = (autoResponses as AutoResponse[]).find((ar) =>
      lowerText.includes(ar.trigger_text.toLowerCase())
    )

    if (match) {
      await ctx.reply(match.response_text)
      await supabase.from('messages').insert({
        conversation_id: conversation.id,
        sender_type: 'bot',
        content: match.response_text,
        message_type: 'text',
      })
    }
  }
}

// -------------------------------------------------------
// Helper: send bot reply and persist in DB
// -------------------------------------------------------
async function sendBotReply(ctx: BotContext, conversationId: string, content: string) {
  await ctx.reply(content)
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_type: 'bot',
    content,
    message_type: 'text',
  })
}

// -------------------------------------------------------
// Helper: handle expired/invalid casino token
// -------------------------------------------------------
async function handleExpiredToken(ctx: BotContext, customerId: string, conversationId: string) {
  await supabase
    .from('customers')
    .update({ casino_token: null })
    .eq('id', customerId)

  await sendBotReply(ctx, conversationId, 'Tu sesión expiró. ¿Cuál es tu usuario para volver a ingresar?')
}
