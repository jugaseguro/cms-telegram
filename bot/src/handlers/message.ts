import type { BotContext } from '../bot'
import { supabase } from '../lib/supabase'
import { findOrCreateCustomer, findOrCreateConversation, isMessageAlreadySaved, insertMessageSafe } from '../helpers'
import type { AutoResponse } from '../lib/types'
import { buildHistory, callAI, checkRateLimit } from '../ai/openai'
import { loginCasino, registerCasino, getBalance, validateJwtQuick, createDeposit, getProviderId, createWithdrawal, getTransactions, CasinoAuthError } from '../api/casino'
import { encryptToken, decryptToken } from '../lib/crypto'

// -------------------------------------------------------
// Shared patterns for confirmation responses & cancel
// -------------------------------------------------------

const YES_PATTERN = /^(s[ií]+|si+|dale(\s*dale)?|ok+|okey|okay|bueno|claro|obvio|sip+|sep|afirmativo|ya|confirmo|confirmar|listo|perfecto|va+|vamos|seguro|por\s*supuesto|genial|de\s*una|eso|exacto|sale|bien|correcto|por\s*fa|porfa|porfavor|quiero|agente|humano)/i
const NO_PATTERN = /^(no+|nah+|nel|cancel[ao]?r?|mejor\s*no|nop[e]?|paso|na+h?|cambiar|dejá|deja|nope|no\s*quiero|negativo|salir|anular|segu[ií]|continua|continú?a)/i
const CANCEL_PATTERN = /^(cancel[ao]?r?|salir|volver|atrás|atras|menu|menú|inicio|parar|no\s*quiero|dejá|deja)/i
const LOGIN_INTENT = /^(login|log\s*in|iniciar\s*sesi[oó]n|ingresar|entrar|loguearm[e]|loguear|quiero\s*(?:iniciar\s*sesi[oó]n|entrar|ingresar|loguearme))/i
const DEPOSIT_INTENT = /(quiero cargar|cargar saldo|cargar plata|cargar dinero|depositar|meter plata|hacer dep[oó]sito|quiero depositar|cargar|deposito|depósito)/i
const WITHDRAW_INTENT = /(quiero retirar|retirar saldo|retirar plata|retirar dinero|sacar plata|retiro|hacer retiro)/i
const BALANCE_INTENT = /(ver\s*(?:mi\s*)?saldo|cu[aá]nto\s+tengo|mi\s*saldo|balance|saldo\s*actual|consultar\s*saldo)/i
const REGISTER_INTENT = /(registrarm[e]|crear\s*(?:una?\s*)?cuenta|nueva\s*cuenta|quiero\s*registrarm[e]|abrir\s*cuenta)/i
const TRANSACTION_INTENT = /(ver\s*(?:mis\s*)?movimientos|historial|transacciones|mis\s*movimientos)/i
const AGENT_INTENT = /(hablar\s*con\s*(?:un\s*)?agente|agente\s*humano|quiero\s*(?:un\s*)?agente|operador)/i
const WITHDRAWAL_BT_PATTERN = /^(1|bt|transferencia|bancaria|transferencia\s*bancaria|banco)/i
const WITHDRAWAL_MP_PATTERN = /^(2|mp|mercado\s*pago|mercadopago)/i

const PENDING_ACTION_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Checks if user message matches any intent OTHER than the current flow
function matchesAnyOtherIntent(text: string, currentFlow: string): boolean {
  const intentMap: Record<string, RegExp> = {
    deposit: DEPOSIT_INTENT,
    withdrawal: WITHDRAW_INTENT,
    login: LOGIN_INTENT,
    balance: BALANCE_INTENT,
    register: REGISTER_INTENT,
    transactions: TRANSACTION_INTENT,
    agent: AGENT_INTENT,
  }
  for (const [key, pattern] of Object.entries(intentMap)) {
    if (key === currentFlow) continue
    if (pattern.test(text)) return true
  }
  return CANCEL_PATTERN.test(text)
}

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

// -------------------------------------------------------
// Deterministic data parsers (bypass AI for pending_action)
// -------------------------------------------------------

function parseDepositData(text: string): { first_name: string; last_name: string; amount: number } | null {
  const parts = text.trim().split(/\s+/)
  if (parts.length < 3) return null

  // Find which part is the amount
  let amountIndex = -1
  let amount = 0
  for (let i = 0; i < parts.length; i++) {
    const cleaned = parts[i].replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.')
    const num = Number(cleaned)
    if (!isNaN(num) && num >= 1500) {
      amountIndex = i
      amount = num
      break
    }
  }

  if (amountIndex === -1) return null

  const nameParts = parts.filter((_, i) => i !== amountIndex)
  if (nameParts.length < 2) return null

  // Last word is last name, everything else is first name
  const last_name = nameParts[nameParts.length - 1]
  const first_name = nameParts.slice(0, -1).join(' ')

  return { first_name, last_name, amount }
}

function parseWithdrawalData(text: string): { amount: number; cbu: string; cuit: string; account_holder: string } | null {
  const parts = text.trim().split(/\s+/)
  if (parts.length < 4) return null

  let amount = 0
  let cbu = ''
  let cuit = ''
  const nameParts: string[] = []

  for (const part of parts) {
    const digitsOnly = part.replace(/[-.\s]/g, '')

    if (/^\d{22}$/.test(digitsOnly) && !cbu) {
      cbu = digitsOnly
    } else if (/^\d{7,11}$/.test(digitsOnly) && !cuit) {
      cuit = digitsOnly
    } else {
      const cleaned = part.replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.')
      const num = Number(cleaned)
      if (!isNaN(num) && num >= 100 && amount === 0) {
        amount = num
      } else {
        nameParts.push(part)
      }
    }
  }

  if (!amount || !cbu || !cuit || nameParts.length === 0) return null

  return { amount, cbu, cuit, account_holder: nameParts.join(' ') }
}

function validateDepositArgs(args: Record<string, unknown>): string | null {
  const amount = Number(args.amount)
  if (isNaN(amount) || amount < 1500 || amount > 500000)
    return 'El monto debe estar entre $1.500 y $500.000 ARS.'
  if (typeof args.first_name !== 'string' || args.first_name.trim().length < 2)
    return 'El nombre debe tener al menos 2 caracteres.'
  if (typeof args.last_name !== 'string' || args.last_name.trim().length < 2)
    return 'El apellido debe tener al menos 2 caracteres.'
  return null
}

function validateWithdrawArgs(args: Record<string, unknown>, channel: string = 'BT'): string | null {
  const amount = Number(args.amount)
  const limits = channel === 'MP'
    ? { min: 10000, max: 1000000, label: '$10.000 y $1.000.000' }
    : { min: 2000, max: 500000, label: '$2.000 y $500.000' }
  if (isNaN(amount) || amount < limits.min || amount > limits.max)
    return `El monto debe estar entre ${limits.label} ARS.`

  // Normalize CBU/CVU: strip spaces, dashes, dots
  const cbuRaw = typeof args.cbu === 'string' ? args.cbu.replace(/[\s\-\.]/g, '') : ''
  if (!/^\d{22}$/.test(cbuRaw))
    return 'El CBU/CVU debe tener exactamente 22 dígitos.'
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
  // TTL: Clear stale pending_action (>5 min)
  // -------------------------------------------------------
  if (conversation.pending_action && isPendingActionStale(conversation.pending_action)) {
    await supabase
      .from('conversations')
      .update({ pending_action: null })
      .eq('id', conversation.id)
    conversation.pending_action = null

    // Insert marker so AI knows the previous flow ended
    await supabase.from('messages').insert({
      conversation_id: conversation.id,
      sender_type: 'bot',
      content: '[La operación anterior fue cancelada por inactividad]',
      message_type: 'text',
    })
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

  // -------------------------------------------------------
  // WITHDRAWAL METHOD: User picks BT or MP
  // -------------------------------------------------------
  if (ctx.aiEnabled && conversation.pending_action?.type === 'awaiting_withdrawal_method') {
    const trimmed = text.trim()
    console.log(`[awaiting_withdrawal_method] User said: "${trimmed}"`)

    // If user changes intent, clear pending_action and let message flow through
    if (matchesAnyOtherIntent(trimmed, 'withdrawal')) {
      console.log('[awaiting_withdrawal_method] Intent change detected, clearing pending_action')
      await supabase.from('conversations').update({ pending_action: null }).eq('id', conversation.id)
      conversation.pending_action = null
      // Fall through to normal processing
    } else {
      await insertMessageSafe({
        conversation_id: conversation.id,
        sender_type: 'customer',
        sender_id: String(from.id),
        content: text,
        message_type: 'text',
        telegram_message_id: ctx.message?.message_id || null,
      })

      let channel: 'BT' | 'MP' | null = null
      if (WITHDRAWAL_BT_PATTERN.test(trimmed)) channel = 'BT'
      else if (WITHDRAWAL_MP_PATTERN.test(trimmed)) channel = 'MP'

      if (!channel) {
        console.log('[awaiting_withdrawal_method] No match for BT or MP pattern')
        await sendBotReply(ctx, conversation.id, 'No entendí tu elección. Respondé con:\n\n1️⃣ Transferencia Bancaria\n2️⃣ Mercado Pago\n\nO escribí "cancelar" para volver atrás.')
        return
      }

      console.log(`[awaiting_withdrawal_method] Selected channel: ${channel}`)
      const cbuLabel = channel === 'MP' ? 'CBU/CVU' : 'CBU'
      const methodName = channel === 'BT' ? 'Transferencia Bancaria' : 'Mercado Pago'
      const limits = channel === 'MP' ? 'entre $10.000 y $1.000.000' : 'entre $2.000 y $500.000'
      const msg = `Para procesar tu retiro por ${methodName} necesito los siguientes datos:\n\n• Monto a retirar (${limits} ARS)\n• ${cbuLabel} (22 dígitos)\n• DNI/CUIT/CUIL\n• Nombre completo del titular\n\nPodés mandarlo todo en un solo mensaje, por ejemplo:\n5000 0110599340055000123456 20123456789 Juan Perez`

      await sendBotReply(ctx, conversation.id, msg)
      await supabase
        .from('conversations')
        .update({ pending_action: { type: 'awaiting_withdrawal_data', channel, created_at: Date.now() } })
        .eq('id', conversation.id)
      return
    }
  }

  // -------------------------------------------------------
  // DEPOSIT: Intercept deposit data (deterministic, no AI)
  // -------------------------------------------------------
  if (ctx.aiEnabled && conversation.pending_action?.type === 'awaiting_deposit_data') {
    const trimmed = text.trim()

    // If user changes intent, clear pending_action and let message flow through
    if (matchesAnyOtherIntent(trimmed, 'deposit')) {
      await supabase.from('conversations').update({ pending_action: null }).eq('id', conversation.id)
      conversation.pending_action = null
      // Fall through to normal processing
    } else {
      await insertMessageSafe({
        conversation_id: conversation.id,
        sender_type: 'customer',
        sender_id: String(from.id),
        content: text,
        message_type: 'text',
        telegram_message_id: ctx.message?.message_id || null,
      })

      const parsed = parseDepositData(text)
      if (!parsed) {
        await sendBotReply(ctx, conversation.id, 'No pude entender los datos. Mandame nombre, apellido y monto en un solo mensaje.\n\nEjemplo: Juan Perez 5000')
        return
      }

      const validationError = validateDepositArgs({ amount: parsed.amount, first_name: parsed.first_name, last_name: parsed.last_name })
      if (validationError) {
        await sendBotReply(ctx, conversation.id, validationError)
        return
      }

      await supabase.from('conversations').update({ pending_action: null }).eq('id', conversation.id)

      const freshCustomer = await findOrCreateCustomer(from, ctx.botId)
      if (!freshCustomer?.casino_token) {
        await sendBotReply(ctx, conversation.id, 'Tu sesión expiró. ¿Cuál es tu usuario para volver a ingresar?')
        return
      }

      await executeDeposit(ctx, conversation.id, freshCustomer.id, freshCustomer.casino_token, freshCustomer.casino_username ?? '', parsed)
      return
    }
  }

  // -------------------------------------------------------
  // WITHDRAWAL: Intercept withdrawal data (deterministic, no AI)
  // -------------------------------------------------------
  if (ctx.aiEnabled && conversation.pending_action?.type === 'awaiting_withdrawal_data') {
    const trimmed = text.trim()

    // If user changes intent, clear pending_action and let message flow through
    if (matchesAnyOtherIntent(trimmed, 'withdrawal')) {
      await supabase.from('conversations').update({ pending_action: null }).eq('id', conversation.id)
      conversation.pending_action = null
      // Fall through to normal processing
    } else {
      // Check if user wants to switch withdrawal method
      const currentChannel = conversation.pending_action?.channel as string
      let switchChannel: 'BT' | 'MP' | null = null
      if (WITHDRAWAL_BT_PATTERN.test(trimmed) && currentChannel !== 'BT') switchChannel = 'BT'
      else if (WITHDRAWAL_MP_PATTERN.test(trimmed) && currentChannel !== 'MP') switchChannel = 'MP'

      if (switchChannel) {
        await insertMessageSafe({
          conversation_id: conversation.id,
          sender_type: 'customer',
          sender_id: String(from.id),
          content: text,
          message_type: 'text',
          telegram_message_id: ctx.message?.message_id || null,
        })
        const cbuLabel = switchChannel === 'MP' ? 'CBU/CVU' : 'CBU'
        const methodName = switchChannel === 'BT' ? 'Transferencia Bancaria' : 'Mercado Pago'
        const limits = switchChannel === 'MP' ? 'entre $10.000 y $1.000.000' : 'entre $2.000 y $500.000'
        const msg = `Para procesar tu retiro por ${methodName} necesito los siguientes datos:\n\n• Monto a retirar (${limits} ARS)\n• ${cbuLabel} (22 dígitos)\n• DNI/CUIT/CUIL\n• Nombre completo del titular\n\nPodés mandarlo todo en un solo mensaje, por ejemplo:\n5000 0110599340055000123456 20123456789 Juan Perez`
        await sendBotReply(ctx, conversation.id, msg)
        await supabase
          .from('conversations')
          .update({ pending_action: { type: 'awaiting_withdrawal_data', channel: switchChannel, created_at: Date.now() } })
          .eq('id', conversation.id)
        return
      }

      await insertMessageSafe({
        conversation_id: conversation.id,
        sender_type: 'customer',
        sender_id: String(from.id),
        content: text,
        message_type: 'text',
        is_sensitive: true,
        telegram_message_id: ctx.message?.message_id || null,
      })

      const parsed = parseWithdrawalData(text)
      if (!parsed) {
        await sendBotReply(ctx, conversation.id, 'No pude entender los datos. Mandame todo en un solo mensaje:\n\nMonto CBU DNI/CUIT Nombre del titular\n\nEjemplo: 5000 0110599340055000123456 20123456789 Juan Perez')
        return
      }

      const withdrawChannel = (conversation.pending_action?.channel as string) || 'BT'
      console.log(`[awaiting_withdrawal_data] Parsed data:`, JSON.stringify(parsed), `channel: ${withdrawChannel}`)
      const validationError = validateWithdrawArgs({ amount: parsed.amount, cbu: parsed.cbu, cuit: parsed.cuit, account_holder: parsed.account_holder }, withdrawChannel)
      if (validationError) {
        await sendBotReply(ctx, conversation.id, validationError)
        return
      }

      await supabase.from('conversations').update({ pending_action: null }).eq('id', conversation.id)

      const freshCustomer = await findOrCreateCustomer(from, ctx.botId)
      if (!freshCustomer?.casino_token) {
        await sendBotReply(ctx, conversation.id, 'Tu sesión expiró. ¿Cuál es tu usuario para volver a ingresar?')
        return
      }

      await executeWithdrawal(ctx, conversation.id, freshCustomer.id, freshCustomer.casino_token, freshCustomer.casino_profile as any, parsed, withdrawChannel)
      return
    }
  }

  // -------------------------------------------------------
  // RELOGIN: Confirmation when user wants to switch accounts
  // -------------------------------------------------------
  if (ctx.aiEnabled && conversation.pending_action?.type === 'awaiting_relogin_confirmation') {
    const lower = text.toLowerCase().trim()

    await insertMessageSafe({
      conversation_id: conversation.id,
      sender_type: 'customer',
      sender_id: String(from.id),
      content: text,
      message_type: 'text',
      telegram_message_id: ctx.message?.message_id || null,
    })

    if (YES_PATTERN.test(lower)) {
      await supabase.from('customers').update({ casino_token: null, casino_username: null, casino_profile: null }).eq('id', customer.id)
      await supabase.from('conversations').update({ pending_action: null }).eq('id', conversation.id)
      await sendBotReply(ctx, conversation.id, 'Sesión cerrada. ¿Cuál es tu nombre de usuario para iniciar sesión?')
      return
    }

    if (NO_PATTERN.test(lower)) {
      await supabase.from('conversations').update({ pending_action: null }).eq('id', conversation.id)
      const currentUser = conversation.pending_action.casino_username as string
      await sendBotReply(ctx, conversation.id, `Perfecto, seguís con la cuenta "${currentUser}". ¿En qué te puedo ayudar?`)
      return
    }

    await sendBotReply(ctx, conversation.id, 'Respondé "sí" para cerrar sesión e iniciar con otra cuenta, o "no" para seguir con la actual.')
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

      // Pre-AI: detect login intent when already logged in
      if (isLoggedIn && LOGIN_INTENT.test(text.trim())) {
        await supabase
          .from('conversations')
          .update({ pending_action: { type: 'awaiting_relogin_confirmation', casino_username: casinoUser, created_at: Date.now() } })
          .eq('id', conversation.id)

        await sendBotReply(ctx, conversation.id, `Ya tenés sesión iniciada como "${casinoUser}". ¿Querés cerrar esta sesión e iniciar con otra cuenta?`)
        return
      }

      // Pre-AI: detect deposit intent to bypass AI entirely (AI sometimes ignores request_deposit)
      if (isLoggedIn && DEPOSIT_INTENT.test(text.trim())) {
        // Validate JWT is actually alive before starting multi-step flow
        if (!await validateJwtQuick(decryptToken(freshCustomer!.casino_token!))) {
          await handleExpiredToken(ctx, freshCustomer!.id, conversation.id)
          return
        }
        const casinoUserName = freshCustomer?.casino_username ?? 'tu cuenta'
        const msg = `Vas a cargar saldo a la cuenta "${casinoUserName}".\n\nPasame los datos del titular que va a hacer la transferencia: nombre, apellido y monto.\n\nPodés mandarlo todo en un solo mensaje, por ejemplo:\nJuan Perez 5000`
        await sendBotReply(ctx, conversation.id, msg)
        await supabase
          .from('conversations')
          .update({ pending_action: { type: 'awaiting_deposit_data', casino_username: casinoUserName, created_at: Date.now() } })
          .eq('id', conversation.id)
        return
      }

      // Pre-AI: detect withdrawal intent to bypass AI entirely
      if (isLoggedIn && WITHDRAW_INTENT.test(text.trim())) {
        // Validate JWT is actually alive before starting multi-step flow
        if (!await validateJwtQuick(decryptToken(freshCustomer!.casino_token!))) {
          await handleExpiredToken(ctx, freshCustomer!.id, conversation.id)
          return
        }
        await sendBotReply(ctx, conversation.id, '¿Por qué método querés retirar?\n\n1️⃣ Transferencia Bancaria\n2️⃣ Mercado Pago')
        await supabase
          .from('conversations')
          .update({ pending_action: { type: 'awaiting_withdrawal_method', created_at: Date.now() } })
          .eq('id', conversation.id)
        return
      }

      const sessionContext = isLoggedIn
        ? `\n\n[ESTADO DE SESIÓN]: El usuario "${casinoUser}" YA tiene sesión iniciada. NO le pidas que inicie sesión. Usá directamente las funciones get_balance, request_deposit, create_deposit, request_withdrawal, create_withdrawal, get_transactions según lo que pida.\n\n[REGLA DEPÓSITO CRÍTICA]: Cuando el usuario quiera depositar/cargar saldo/cargar dinero/cargar plata/meter plata, llamá request_deposit INMEDIATAMENTE. NUNCA generes texto sobre depósitos. NUNCA le preguntes el monto, nombre o apellido vos. El sistema le envía las instrucciones automáticamente. Cuando el usuario te pase nombre, apellido y monto todo junto, llamá create_deposit. NO pidas DNI/CUIT/CUIL, ya no se necesita.\n\n[REGLA RETIRO]: Cuando el usuario quiera retirar/sacar plata/hacer retiro, llamá request_withdrawal INMEDIATAMENTE. NUNCA generes texto sobre retiros. El sistema le envía las opciones de método automáticamente.\n\n[REGLA IMPORTANTE]: NUNCA respondas con texto cuando el usuario pide depositar o cargar. SIEMPRE usá la función request_deposit. NUNCA respondas con texto cuando el usuario pide retirar. SIEMPRE usá request_withdrawal.`
        : `\n\n[ESTADO DE SESIÓN]: El usuario NO tiene sesión iniciada. Si quiere hacer operaciones (saldo, depósito, retiro, movimientos), primero necesita iniciar sesión o crear una cuenta.`

      const casinoLink = `\n\n[LINK DEL CASINO]: Si el usuario pregunta por el link, la página o el sitio del casino, respondé con: https://www.1xclub.bet/`

      const topicBoundaryRule = `\n\n[REGLA DE CONTEXTO]: Cada mensaje del usuario es potencialmente independiente. Si el mensaje actual no se relaciona con el tema anterior, respondé SOLO al nuevo pedido. No continúes un flujo anterior a menos que el usuario lo mencione explícitamente.`

      const systemPrompt = basePrompt + sessionContext + casinoLink + topicBoundaryRule

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
          await supabase
            .from('conversations')
            .update({ pending_action: { type: 'awaiting_deposit_data', casino_username: casinoUserName, created_at: Date.now() } })
            .eq('id', conversation.id)
          return
        }
        await sendBotReply(ctx, conversation.id, result.content)
        return
      }

      const { name, args } = result

      // ---- request_login ----
      // Password is collected securely in the NEXT message, never via OpenAI
      if (name === 'request_login') {
        // If already logged in, offer to switch accounts instead
        if (isLoggedIn) {
          await supabase
            .from('conversations')
            .update({ pending_action: { type: 'awaiting_relogin_confirmation', casino_username: casinoUser, created_at: Date.now() } })
            .eq('id', conversation.id)

          await sendBotReply(ctx, conversation.id, `Ya tenés sesión iniciada como "${casinoUser}". ¿Querés cerrar esta sesión e iniciar con otra cuenta?`)
          return
        }

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
        const encSession = (freshCustomer?.casino_profile as any)?.session
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
        if (!freshCustomer?.casino_token) {
          await sendBotReply(ctx, conversation.id, 'Primero necesitás iniciar sesión. ¿Cuál es tu usuario del casino?')
          return
        }
        // Validate JWT before starting multi-step flow
        if (!await validateJwtQuick(decryptToken(freshCustomer.casino_token))) {
          await handleExpiredToken(ctx, freshCustomer.id, conversation.id)
          return
        }
        const depositUser = freshCustomer.casino_username ?? 'tu cuenta'
        const msg = `Vas a cargar saldo a la cuenta "${depositUser}".\n\nPasame los datos del titular que va a hacer la transferencia: nombre, apellido y monto.\n\nPodés mandarlo todo en un solo mensaje, por ejemplo:\nJuan Perez 5000`
        await sendBotReply(ctx, conversation.id, msg)
        await supabase
          .from('conversations')
          .update({ pending_action: { type: 'awaiting_deposit_data', casino_username: depositUser, created_at: Date.now() } })
          .eq('id', conversation.id)
        return
      }

      // ---- create_deposit ----
      if (name === 'create_deposit') {
        if (!freshCustomer?.casino_token) {
          await sendBotReply(ctx, conversation.id, 'Primero necesitás iniciar sesión. ¿Cuál es tu usuario del casino?')
          return
        }

        const validationError = validateDepositArgs(args)
        if (validationError) {
          await sendBotReply(ctx, conversation.id, validationError)
          return
        }

        await executeDeposit(ctx, conversation.id, freshCustomer.id, freshCustomer.casino_token, freshCustomer.casino_username ?? '', {
          amount: Number(args.amount),
          first_name: (args.first_name as string),
          last_name: (args.last_name as string),
        })
        return
      }

      // ---- request_withdrawal (method selection, no AI text) ----
      if (name === 'request_withdrawal') {
        if (!freshCustomer?.casino_token) {
          await sendBotReply(ctx, conversation.id, 'Primero necesitás iniciar sesión. ¿Cuál es tu usuario del casino?')
          return
        }
        // Validate JWT before starting multi-step flow
        if (!await validateJwtQuick(decryptToken(freshCustomer.casino_token))) {
          await handleExpiredToken(ctx, freshCustomer.id, conversation.id)
          return
        }
        await sendBotReply(ctx, conversation.id, '¿Por qué método querés retirar?\n\n1️⃣ Transferencia Bancaria\n2️⃣ Mercado Pago')
        await supabase
          .from('conversations')
          .update({ pending_action: { type: 'awaiting_withdrawal_method', created_at: Date.now() } })
          .eq('id', conversation.id)
        return
      }

      // ---- create_withdrawal ----
      if (name === 'create_withdrawal') {
        if (!freshCustomer?.casino_token) {
          await sendBotReply(ctx, conversation.id, 'Primero necesitás iniciar sesión. ¿Cuál es tu usuario del casino?')
          return
        }

        const withdrawChannel = (args.channel as string)?.toUpperCase() === 'MP' ? 'MP' : 'BT'
        const validationError = validateWithdrawArgs(args, withdrawChannel)
        if (validationError) {
          await sendBotReply(ctx, conversation.id, validationError)
          return
        }

        await executeWithdrawal(ctx, conversation.id, freshCustomer.id, freshCustomer.casino_token, freshCustomer.casino_profile as any, {
          amount: Number(args.amount),
          cbu: (args.cbu as string),
          cuit: (args.cuit as string),
          account_holder: (args.account_holder as string),
        }, withdrawChannel)
        return
      }

      // ---- get_transactions ----
      if (name === 'get_transactions') {
        if (!freshCustomer?.casino_token) {
          await sendBotReply(ctx, conversation.id, 'Primero necesitás iniciar sesión. ¿Cuál es tu usuario del casino?')
          return
        }

        try {
          const transactions = await getTransactions(decryptToken(freshCustomer.casino_token))

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
          if (err instanceof CasinoAuthError) await handleExpiredToken(ctx, freshCustomer!.id, conversation.id)
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
    .update({ casino_token: null, casino_profile: null })
    .eq('id', customerId)

  await sendBotReply(ctx, conversationId, 'Tu sesión expiró. ¿Cuál es tu usuario para volver a ingresar?')
}

// -------------------------------------------------------
// Helper: execute deposit (shared by pending_action + AI tool handler)
// -------------------------------------------------------
async function executeDeposit(
  ctx: BotContext,
  conversationId: string,
  customerId: string,
  casinoToken: string,
  casinoUsername: string,
  depositArgs: { amount: number; first_name: string; last_name: string },
) {
  try {
    const jwt = decryptToken(casinoToken)
    const monto = depositArgs.amount.toLocaleString('es-AR')
    const userLabel = casinoUsername ? ` para la cuenta ${casinoUsername}` : ''

    await sendBotReply(ctx, conversationId, `Procesando depósito por $${monto} ARS${userLabel}...`)

    const providerId = await getProviderId(jwt)
    if (!providerId) {
      await sendBotReply(ctx, conversationId, 'No se pudo obtener el proveedor de pago. Esto puede ser un problema temporal. Intentá de nuevo en unos minutos o escribí "agente" para que te ayude un operador.')
      return
    }

    const result = await createDeposit(jwt, {
      amount: depositArgs.amount,
      firstName: depositArgs.first_name.trim(),
      lastName: depositArgs.last_name.trim(),
      paymentId: providerId,
    })

    if (result?.url) {
      const msg = `¡Listo! Para completar el pago tocá el siguiente link:\n\n<a href="${result.url}">💳 Completar pago de $${monto} ARS${userLabel}</a>\n\nUna vez que completes el pago, el saldo se va a acreditar automáticamente en tu cuenta.\n\n⏳ La acreditación puede demorar unos minutos. Si tenés algún inconveniente, escribí "agente" para comunicarte con un operador.\n\n🎰 <a href="https://www.1xclub.bet/">Ir al casino</a>`
      await sendBotReply(ctx, conversationId, msg, { parse_mode: 'HTML' })
    } else {
      await sendBotReply(ctx, conversationId, 'Hubo un problema al generar el enlace de pago. Intentá de nuevo o contactá a un agente.')
    }
  } catch (err) {
    if (err instanceof CasinoAuthError) {
      await handleExpiredToken(ctx, customerId, conversationId)
    } else {
      console.error('[create_deposit] Error:', err)
      await sendBotReply(ctx, conversationId, 'Hubo un error procesando el depósito. Intentá de nuevo más tarde.')
    }
  }
}

// -------------------------------------------------------
// Helper: execute withdrawal (shared by pending_action + AI tool handler)
// -------------------------------------------------------
async function executeWithdrawal(
  ctx: BotContext,
  conversationId: string,
  customerId: string,
  casinoToken: string,
  casinoProfile: Record<string, unknown> | null,
  withdrawArgs: { amount: number; cbu: string; cuit: string; account_holder: string },
  channel: string = 'BT',
) {
  try {
    const jwt = decryptToken(casinoToken)
    const methodLabel = channel === 'MP' ? 'Mercado Pago' : 'Transferencia Bancaria'

    const encSession = (casinoProfile as any)?.session
    let currentBalance: number | null = null
    if (encSession) {
      currentBalance = await getBalance(decryptToken(encSession))
      if (currentBalance !== null && currentBalance < withdrawArgs.amount) {
        await sendBotReply(ctx, conversationId, `No tenés saldo suficiente para retirar $${withdrawArgs.amount.toLocaleString('es-AR')} ARS. Tu saldo actual es: $${currentBalance.toLocaleString('es-AR')} ARS.`)
        return
      }
    }

    const montoRetiro = withdrawArgs.amount.toLocaleString('es-AR')
    const balanceMsg = currentBalance !== null ? `Tu saldo actual es $${currentBalance.toLocaleString('es-AR')} ARS. ` : ''
    await sendBotReply(ctx, conversationId, `${balanceMsg}Procesando retiro por $${montoRetiro} ARS vía ${methodLabel}...`)

    console.log(`[executeWithdrawal] Getting provider for channel: ${channel}`)
    const paymentId = await getProviderId(jwt, channel)
    if (!paymentId) {
      console.error(`[executeWithdrawal] No provider found for channel: ${channel}`)
      await sendBotReply(ctx, conversationId, 'No se pudo obtener el proveedor de pago para este método. Intentá de nuevo o escribí "agente" para que te ayude un operador.')
      return
    }

    console.log(`[executeWithdrawal] Provider found: ${paymentId}, channel: ${channel}`)
    const withdrawPayload = {
      amount: withdrawArgs.amount,
      cbu: withdrawArgs.cbu.trim(),
      cuitl: withdrawArgs.cuit.trim(),
      accountHolder: withdrawArgs.account_holder.trim(),
      paymentId,
      channel,
    }
    console.log(`[executeWithdrawal] Sending payload:`, JSON.stringify(withdrawPayload))

    const success = await createWithdrawal(jwt, withdrawPayload)

    if (success) {
      console.log(`[executeWithdrawal] Withdrawal successful`)
      await sendBotReply(ctx, conversationId, `✅ Retiro solicitado correctamente por $${withdrawArgs.amount.toLocaleString('es-AR')} ARS vía ${methodLabel}. Será procesado en breve.`)
    } else {
      console.error(`[executeWithdrawal] Withdrawal failed (API returned error)`)
      await sendBotReply(ctx, conversationId, 'No pude procesar el retiro en este momento. Intentá de nuevo o contactá a un agente.')
    }
  } catch (err) {
    if (err instanceof CasinoAuthError) {
      await handleExpiredToken(ctx, customerId, conversationId)
    } else {
      throw err
    }
  }
}
