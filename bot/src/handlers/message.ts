import type { BotContext } from '../bot'
import { supabase } from '../lib/supabase'
import { findOrCreateCustomer, findOrCreateConversation, isMessageAlreadySaved, insertMessageSafe } from '../helpers'
import type { AutoResponse } from '../lib/types'
import { buildHistory, callAI, checkRateLimit } from '../ai/openai'
import { loginCasino, registerCasino, getBalance, createDeposit, getProviderId, createWithdrawal, getTransactions, CasinoAuthError } from '../api/casino'
import { encryptToken, decryptToken } from '../lib/crypto'

// -------------------------------------------------------
// Shared patterns for confirmation responses & cancel
// -------------------------------------------------------

const YES_PATTERN = /^(s[ií]+|si+|dale(\s*dale)?|ok+|okey|okay|bueno|claro|obvio|sip+|sep|afirmativo|ya|confirmo|confirmar|listo|perfecto|va+|vamos|seguro|por\s*supuesto|genial|de\s*una|eso|exacto|sale|bien|correcto|por\s*fa|porfa|porfavor|quiero|agente|humano)/i
const NO_PATTERN = /^(no+|nah+|nel|cancel[ao]?r?|mejor\s*no|nop[e]?|paso|na+h?|cambiar|dejá|deja|nope|no\s*quiero|negativo|salir|anular|segu[ií]|continua|continú?a)/i
const CANCEL_PATTERN = /^(cancel[ao]?r?|salir|volver|atrás|atras|menu|menú|inicio|parar|no\s*quiero|dejá|deja)/i

const PENDING_ACTION_TTL_MS = 10 * 60 * 1000 // 10 minutes

function isPendingActionStale(pendingAction: Record<string, unknown> | null): boolean {
  if (!pendingAction?.created_at) return false
  return Date.now() - (pendingAction.created_at as number) > PENDING_ACTION_TTL_MS
}

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
  return null
}

function validateWithdrawArgs(args: Record<string, unknown>): string | null {
  const amount = Number(args.amount)
  if (isNaN(amount) || amount < 100 || amount > 500000)
    return 'El monto debe estar entre $100 y $500.000 ARS.'

  // Normalize CBU: strip spaces, dashes, dots
  const cbuRaw = typeof args.cbu === 'string' ? args.cbu.replace(/[\s\-\.]/g, '') : ''
  if (!/^\d{22}$/.test(cbuRaw))
    return 'El CBU debe tener exactamente 22 dígitos.'
  args.cbu = cbuRaw

  // Normalize CUIT: strip dashes and spaces
  const cuitRaw = typeof args.cuit === 'string' ? args.cuit.replace(/[\-\s]/g, '') : ''
  if (!/^\d{7,11}$/.test(cuitRaw))
    return 'El DNI/CUIL/CUIT debe tener entre 7 y 11 dígitos.'
  args.cuit = cuitRaw

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
  // TTL: Clear stale pending_action (>10 min)
  // -------------------------------------------------------
  if (conversation.pending_action && isPendingActionStale(conversation.pending_action)) {
    await supabase
      .from('conversations')
      .update({ pending_action: null })
      .eq('id', conversation.id)
    conversation.pending_action = null
  }

  // -------------------------------------------------------
  // CANCEL: Universal cancel detection for any pending_action
  // -------------------------------------------------------
  if (conversation.pending_action && CANCEL_PATTERN.test(text.trim().toLowerCase())) {
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

    await sendBotReply(ctx, conversation.id, 'Operación cancelada. ¿En qué te puedo ayudar?')
    return
  }

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
        await sendBotReply(ctx, conversation.id, 'Usuario o contraseña incorrectos. Podés intentar de nuevo enviándome tu usuario, o escribí "registrarme" si necesitás crear una cuenta.')
        return
      }

      const profileWithEncSession = { ...loginResult.profile, session: encryptToken(loginResult.session) }
      await supabase
        .from('customers')
        .update({
          casino_token: encryptToken(loginResult.jwt),
          casino_username: casinoUsername,
          casino_profile: profileWithEncSession as any,
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

    // Show confirmation before registering — password stored encrypted, never shown in chat
    await supabase
      .from('conversations')
      .update({ pending_action: { type: 'awaiting_register_confirm', username: pending.username, password: encryptToken(text), created_at: Date.now() } })
      .eq('id', conversation.id)

    const masked = text[0] + '*'.repeat(text.length - 2) + text[text.length - 1]
    await sendBotReply(ctx, conversation.id, `Confirmá tus datos:\n\n👤 Usuario: ${pending.username}\n🔑 Contraseña: ${masked}\n\n¿Está todo bien? (sí/no)`)
    return
  }

  // -------------------------------------------------------
  // REGISTER: Confirmation step
  // -------------------------------------------------------
  if (ctx.aiEnabled && conversation.pending_action?.type === 'awaiting_register_confirm') {
    const pending = conversation.pending_action
    const lower = text.toLowerCase().trim()

    if (NO_PATTERN.test(lower)) {
      await supabase
        .from('conversations')
        .update({ pending_action: { type: 'awaiting_register_password', username: pending.username, created_at: Date.now() } })
        .eq('id', conversation.id)

      await sendBotReply(ctx, conversation.id, 'OK, elegí otra contraseña (entre 8 y 30 caracteres).')
      return
    }

    if (!YES_PATTERN.test(lower)) {
      await sendBotReply(ctx, conversation.id, 'Respondé "sí" para confirmar o "no" para cambiar la contraseña.')
      return
    }

    const operator = ctx.casinoOperator ?? 'DEFAULT'

    const plainPassword = decryptToken(pending.password as string)

    await supabase
      .from('conversations')
      .update({ pending_action: null })
      .eq('id', conversation.id)

    try {
      const success = await registerCasino({
        username: pending.username as string,
        password: plainPassword,
        operator,
      })

      if (success) {
        // Auto-login after successful registration
        const loginResult = await loginCasino(
          pending.username as string,
          plainPassword,
          from.id,
          from.username,
          operator,
        )

        if (loginResult) {
          // Encrypt session before storing in profile
          const profileWithEncSession = { ...loginResult.profile, session: encryptToken(loginResult.session) }
          await supabase
            .from('customers')
            .update({
              casino_username: pending.username as string,
              casino_token: encryptToken(loginResult.jwt),
              casino_profile: profileWithEncSession as any,
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

          await sendBotReply(ctx, conversation.id, `¡Cuenta creada exitosamente, ${pending.username}! 🎉\n\nNo pude iniciar sesión automáticamente, pero podés hacerlo escribiendo "iniciar sesión" con tu usuario y contraseña.`)
        }
      } else {
        await sendBotReply(ctx, conversation.id, 'No pude crear la cuenta. Intentá de nuevo en un momento.')
      }
    } catch (err: any) {
      if (err.message === 'casino_user_exists') {
        // Keep encrypted password, ask for new username only
        await supabase
          .from('conversations')
          .update({ pending_action: { type: 'awaiting_register_new_username', password: encryptToken(plainPassword), created_at: Date.now() } })
          .eq('id', conversation.id)

        await sendBotReply(ctx, conversation.id, 'Ese usuario ya está en uso. Elegí otro nombre de usuario (tu contraseña se mantiene).')
      } else if (err.message === 'casino_password_invalid') {
        await supabase
          .from('conversations')
          .update({ pending_action: { type: 'awaiting_register_password', username: pending.username, created_at: Date.now() } })
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

    // Show confirmation with new username + saved password (already encrypted)
    await supabase
      .from('conversations')
      .update({ pending_action: { type: 'awaiting_register_confirm', username, password: pending.password, created_at: Date.now() } })
      .eq('id', conversation.id)

    const plainPw = decryptToken(pending.password as string)
    const masked = plainPw[0] + '*'.repeat(plainPw.length - 2) + plainPw[plainPw.length - 1]
    await sendBotReply(ctx, conversation.id, `Confirmá tus datos:\n\n👤 Usuario: ${username}\n🔑 Contraseña: ${masked}\n\n¿Está todo bien? (sí/no)`)
    return
  }

  // -------------------------------------------------------
  // Handle agent confirmation response
  // -------------------------------------------------------
  if (conversation.pending_action?.type === 'awaiting_agent_confirmation') {
    const lower = text.toLowerCase().trim()

    if (YES_PATTERN.test(lower)) {
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

    if (NO_PATTERN.test(lower)) {
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
      const basePrompt = ctx.aiSystemPrompt ?? 'Eres un asistente virtual amigable. Responde en el mismo idioma que el usuario.'

      // Re-fetch customer to get latest casino state (may have changed during this conversation)
      const freshCustomer = await findOrCreateCustomer(from, ctx.botId)
      const isLoggedIn = !!(freshCustomer?.casino_token)
      const casinoUser = freshCustomer?.casino_username

      // Pre-AI: detect deposit intent to bypass AI entirely (AI sometimes ignores request_deposit)
      const DEPOSIT_INTENT = /^(quiero cargar|cargar saldo|cargar plata|cargar dinero|depositar|meter plata|hacer dep[oó]sito|quiero depositar|cargar|deposito|depósito)/i
      if (isLoggedIn && DEPOSIT_INTENT.test(text.trim())) {
        const casinoUserName = freshCustomer?.casino_username ?? 'tu cuenta'
        const msg = `Vas a cargar saldo a la cuenta "${casinoUserName}".\n\nPasame los datos del titular que va a hacer la transferencia: nombre, apellido y monto.\n\nPodés mandarlo todo en un solo mensaje, por ejemplo:\nJuan Perez 5000`
        await sendBotReply(ctx, conversation.id, msg)
        return
      }

      // Pre-AI: detect withdrawal intent to bypass AI entirely
      const WITHDRAW_INTENT = /^(quiero retirar|retirar saldo|retirar plata|retirar dinero|sacar plata|retiro|hacer retiro)/i
      if (isLoggedIn && WITHDRAW_INTENT.test(text.trim())) {
        await sendBotReply(ctx, conversation.id, 'Para procesar tu retiro necesito los siguientes datos:\n\n• Monto a retirar\n• CBU (22 dígitos)\n• DNI/CUIT/CUIL\n• Nombre completo del titular\n\nPodés mandarlo todo en un solo mensaje, por ejemplo:\n5000 0110599340055000123456 20123456789 Juan Perez')
        return
      }

      const sessionContext = isLoggedIn
        ? `\n\n[ESTADO DE SESIÓN]: El usuario "${casinoUser}" YA tiene sesión iniciada. NO le pidas que inicie sesión. Usá directamente las funciones get_balance, request_deposit, create_deposit, create_withdrawal, get_transactions según lo que pida.\n\n[REGLA DEPÓSITO CRÍTICA]: Cuando el usuario quiera depositar/cargar saldo/cargar dinero/cargar plata/meter plata, llamá request_deposit INMEDIATAMENTE. NUNCA generes texto sobre depósitos. NUNCA le preguntes el monto, nombre o apellido vos. El sistema le envía las instrucciones automáticamente. Cuando el usuario te pase nombre, apellido y monto todo junto, llamá create_deposit. NO pidas DNI/CUIT/CUIL, ya no se necesita.\n\n[REGLA IMPORTANTE]: NUNCA respondas con texto cuando el usuario pide depositar o cargar. SIEMPRE usá la función request_deposit.`
        : `\n\n[ESTADO DE SESIÓN]: El usuario NO tiene sesión iniciada. Si quiere hacer operaciones (saldo, depósito, retiro, movimientos), primero necesita iniciar sesión o crear una cuenta.`

      const casinoLink = `\n\n[LINK DEL CASINO]: Si el usuario pregunta por el link, la página o el sitio del casino, respondé con: https://www.1xclub.bet/`

      const systemPrompt = basePrompt + sessionContext + casinoLink

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
        // If AI generated deposit-related text instead of calling request_deposit, intercept it
        if (isLoggedIn && /(?:pasame|decime|necesito|enviame|mandame|proporcion|indic).*(nombre|apellido|monto|datos|titular|cantidad|depositar|cargar)|(?:orden|solicitud).*dep[oó]sito|cu[aá]nto quer[eé]s (cargar|depositar)|monto.*(?:cargar|depositar|dep[oó]sito)|DNI.*CUIT.*CUIL|datos del titular|(?:dep[oó]sito|cargar\s*saldo).*(?:monto|cuánto|cu[aá]nto)/i.test(result.content)) {
          const casinoUserName = freshCustomer?.casino_username ?? 'tu cuenta'
          const fixedMsg = `Vas a cargar saldo a la cuenta "${casinoUserName}".\n\nPasame los datos del titular que va a hacer la transferencia: nombre, apellido y monto.\n\nPodés mandarlo todo en un solo mensaje, por ejemplo:\nJuan Perez 5000`
          await sendBotReply(ctx, conversation.id, fixedMsg)
          return
        }
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
          .update({ pending_action: { type: 'awaiting_password', casino_username: username, created_at: Date.now() } })
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
          .update({ pending_action: { type: 'awaiting_register_password', username, created_at: Date.now() } })
          .eq('id', conversation.id)

        await sendBotReply(ctx, conversation.id, `Perfecto, casi listo! Ahora elegí una contraseña para tu cuenta (entre 8 y 30 caracteres).`)
        return
      }

      // ---- get_balance ----
      if (name === 'get_balance') {
        const encSession = (customer.casino_profile as any)?.session
        if (!encSession) {
          await sendBotReply(ctx, conversation.id, 'Primero necesitás iniciar sesión. ¿Cuál es tu usuario del casino?')
          return
        }
        const balance = await getBalance(decryptToken(encSession))
        if (balance === null) {
          await sendBotReply(ctx, conversation.id, 'No pude obtener tu saldo. Tu sesión puede haber expirado. Escribí "iniciar sesión" para volver a ingresar.')
        } else {
          await sendBotReply(ctx, conversation.id, `Tu saldo actual es: $${balance.toLocaleString('es-AR')} ARS`)
        }
        return
      }

      // ---- request_deposit (fixed message, no AI text) ----
      if (name === 'request_deposit') {
        if (!customer.casino_token) {
          await sendBotReply(ctx, conversation.id, 'Primero necesitás iniciar sesión. ¿Cuál es tu usuario del casino?')
          return
        }
        const casinoUser = customer.casino_username ?? 'tu cuenta'
        const msg = `Vas a cargar saldo a la cuenta "${casinoUser}".\n\nPasame los datos del titular que va a hacer la transferencia: nombre, apellido y monto.\n\nPodés mandarlo todo en un solo mensaje, por ejemplo:\nJuan Perez 5000`
        await sendBotReply(ctx, conversation.id, msg)
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

        try {
          const jwt = decryptToken(customer.casino_token)
          const monto = Number(args.amount).toLocaleString('es-AR')
          const casinoUsername = customer.casino_username ?? ''
          const userLabel = casinoUsername ? ` para la cuenta ${casinoUsername}` : ''

          await sendBotReply(ctx, conversation.id, `Procesando depósito por $${monto} ARS${userLabel}...`)

          const providerId = await getProviderId(jwt)
          if (!providerId) {
            await sendBotReply(ctx, conversation.id, 'No se pudo obtener el proveedor de pago. Esto puede ser un problema temporal. Intentá de nuevo en unos minutos o escribí "agente" para que te ayude un operador.')
            return
          }

          const result = await createDeposit(jwt, {
            amount: Number(args.amount),
            firstName: (args.first_name as string).trim(),
            lastName: (args.last_name as string).trim(),
            paymentId: providerId,
          })

          if (result?.url) {
            const msg = `¡Listo! Para completar el pago tocá el siguiente link:\n\n<a href="${result.url}">💳 Completar pago de $${monto} ARS${userLabel}</a>\n\nUna vez que completes el pago, el saldo se va a acreditar automáticamente en tu cuenta.\n\n⏳ La acreditación puede demorar unos minutos. Si tenés algún inconveniente, escribí "agente" para comunicarte con un operador.\n\n🎰 <a href="https://www.1xclub.bet/">Ir al casino</a>`
            await sendBotReply(ctx, conversation.id, msg, { parse_mode: 'HTML' })
          } else {
            await sendBotReply(ctx, conversation.id, 'Hubo un problema al generar el enlace de pago. Intentá de nuevo o contactá a un agente.')
          }
        } catch (err) {
          if (err instanceof CasinoAuthError) {
            await handleExpiredToken(ctx, customer.id, conversation.id)
          } else {
            console.error('[create_deposit] Error:', err)
            await sendBotReply(ctx, conversation.id, 'Hubo un error procesando el depósito. Intentá de nuevo más tarde.')
          }
        }
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
          // Check balance before attempting withdrawal
          const encSession = (customer.casino_profile as any)?.session
          let currentBalance: number | null = null
          if (encSession) {
            currentBalance = await getBalance(decryptToken(encSession))
            if (currentBalance !== null && currentBalance < Number(args.amount)) {
              await sendBotReply(ctx, conversation.id, `No tenés saldo suficiente para retirar $${Number(args.amount).toLocaleString('es-AR')} ARS. Tu saldo actual es: $${currentBalance.toLocaleString('es-AR')} ARS.`)
              return
            }
          }

          const montoRetiro = Number(args.amount).toLocaleString('es-AR')
          const balanceMsg = currentBalance !== null ? `Tu saldo actual es $${currentBalance.toLocaleString('es-AR')} ARS. ` : ''
          await sendBotReply(ctx, conversation.id, `${balanceMsg}Procesando retiro por $${montoRetiro} ARS...`)

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
          .update({ pending_action: { type: 'awaiting_agent_confirmation', created_at: Date.now() } })
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
async function sendBotReply(ctx: BotContext, conversationId: string, content: string, options?: { parse_mode?: 'HTML' | 'MarkdownV2' }) {
  await ctx.reply(content, options)
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
