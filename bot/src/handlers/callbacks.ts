import type { InlineKeyboard } from 'grammy'
import type { BotContext } from '../bot'
import { findOrCreateCustomer, findOrCreateConversation, insertMessageSafe } from '../helpers'
import { supabase } from '../lib/supabase'
import { decryptToken } from '../lib/crypto'
import { getBalance, getTransactions, validateJwtQuick, CasinoAuthError } from '../api/casino'
import { menuLoggedIn, menuNotLoggedIn, menuAuth, confirmYesNo, withdrawMethod } from '../keyboards'

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

async function sendAndSave(ctx: BotContext, conversationId: string, text: string, options?: { reply_markup?: InlineKeyboard; parse_mode?: 'HTML' | 'MarkdownV2' }) {
  const sent = await ctx.reply(text, options)
  await insertMessageSafe({
    conversation_id: conversationId,
    sender_type: 'bot',
    sender_id: ctx.botId,
    content: text,
    message_type: 'text',
    telegram_message_id: sent.message_id,
  })
}

export async function handleCallbackQuery(ctx: BotContext) {
  const data = ctx.callbackQuery?.data
  if (!data || !ctx.from) return

  await ctx.answerCallbackQuery()

  // If the bot is globally paused, we ignore all inline button interactions
  const isPausedFromDB = await getBotPausedState(ctx.botId)
  console.log(`[callbacks] isPaused from DB:`, isPausedFromDB)
  if (isPausedFromDB) return

  const customer = await findOrCreateCustomer(ctx.from, ctx.botId)
  if (!customer) return
  const conversation = await findOrCreateConversation(customer.id, ctx.botId)
  if (!conversation) return

  switch (data) {
    // ---- Registration ----
    case 'start:register':
    case 'menu:register': {
      await sendAndSave(ctx, conversation.id,
        '¡Genial! Para crear tu cuenta, enviame el nombre de usuario (nickname) que querés usar.')
      await supabase.from('conversations').update({
        pending_action: { type: 'awaiting_register_username', created_at: Date.now() },
      }).eq('id', conversation.id)
      break
    }

    // ---- Login ----
    case 'start:login':
    case 'menu:login': {
      await sendAndSave(ctx, conversation.id,
        'Enviame tu nombre de usuario para iniciar sesión.')
      await supabase.from('conversations').update({
        pending_action: { type: 'awaiting_login_username', created_at: Date.now() },
      }).eq('id', conversation.id)
      break
    }

    // ---- Deposit ----
    case 'start:deposit':
    case 'menu:deposit': {
      if (!customer.casino_token) {
        await sendAndSave(ctx, conversation.id,
          'Para cargar saldo primero necesitás tener una cuenta. ¿Querés crear una o ya tenés?',
          { reply_markup: menuAuth() })
      } else {
        try {
          if (!await validateJwtQuick(decryptToken(customer.casino_token))) {
            await supabase.from('customers').update({ casino_token: null, casino_profile: null }).eq('id', customer.id)
            await sendAndSave(ctx, conversation.id, 'Tu sesión expiró. Ingresá de nuevo para continuar.', { reply_markup: menuAuth() })
            break
          }
          const casinoUserName = customer.casino_username ?? 'tu cuenta'
          await sendAndSave(ctx, conversation.id,
            `Vas a cargar saldo a la cuenta "${casinoUserName}".\n\nPasame los datos del titular de la transferencia: nombre, apellido y monto.\n\nPodés mandarlo todo en un solo mensaje, por ejemplo:\nJuan Perez 5000`)
          await supabase.from('conversations').update({
            pending_action: { type: 'awaiting_deposit_data', casino_username: casinoUserName, created_at: Date.now() },
          }).eq('id', conversation.id)
        } catch (err) {
          console.error('Deposit callback error:', err)
          await supabase.from('customers').update({ casino_token: null, casino_profile: null }).eq('id', customer.id)
          await sendAndSave(ctx, conversation.id, 'Tu sesión expiró. Ingresá de nuevo para continuar.', { reply_markup: menuAuth() })
        }
      }
      break
    }

    // ---- Withdrawal ----
    case 'menu:withdraw': {
      if (!customer.casino_token) {
        await sendAndSave(ctx, conversation.id,
          'Para retirar primero necesitás iniciar sesión.',
          { reply_markup: menuAuth() })
        break
      }
      try {
        if (!await validateJwtQuick(decryptToken(customer.casino_token))) {
          await supabase.from('customers').update({ casino_token: null, casino_profile: null }).eq('id', customer.id)
          await sendAndSave(ctx, conversation.id, 'Tu sesión expiró. Ingresá de nuevo para continuar.', { reply_markup: menuAuth() })
          break
        }
        await sendAndSave(ctx, conversation.id,
          '¿Por qué método querés retirar?',
          { reply_markup: withdrawMethod() })
        await supabase.from('conversations').update({
          pending_action: { type: 'awaiting_withdrawal_method', created_at: Date.now() },
        }).eq('id', conversation.id)
      } catch (err) {
        console.error('Withdraw callback error:', err)
        await supabase.from('customers').update({ casino_token: null, casino_profile: null }).eq('id', customer.id)
        await sendAndSave(ctx, conversation.id, 'Tu sesión expiró. Ingresá de nuevo para continuar.', { reply_markup: menuAuth() })
      }
      break
    }

    // ---- Withdrawal method selection ----
    case 'withdraw:bt':
    case 'withdraw:mp': {
      const channel = data === 'withdraw:bt' ? 'BT' : 'MP'
      const cbuLabel = channel === 'MP' ? 'CBU/CVU' : 'CBU'
      const methodName = channel === 'BT' ? 'Transferencia Bancaria' : 'Mercado Pago'
      const limits = channel === 'MP' ? 'entre $10.000 y $1.000.000' : 'entre $2.000 y $500.000'
      const msg = `Para procesar tu retiro por ${methodName} necesito los siguientes datos:\n\n• Monto a retirar (${limits} ARS)\n• ${cbuLabel} (22 dígitos)\n• DNI/CUIT/CUIL\n• Nombre completo del titular\n\nPodés mandarlo todo en un solo mensaje, por ejemplo:\n5000 0110599340055000123456 20123456789 Juan Perez`
      await sendAndSave(ctx, conversation.id, msg)
      await supabase.from('conversations').update({
        pending_action: { type: 'awaiting_withdrawal_data', channel, created_at: Date.now() },
      }).eq('id', conversation.id)
      break
    }

    // ---- Balance ----
    case 'menu:balance': {
      if (!customer.casino_token) {
        await sendAndSave(ctx, conversation.id, 'Primero necesitás iniciar sesión.', { reply_markup: menuAuth() })
        break
      }
      try {
        const encSession = (customer.casino_profile as any)?.session
        if (!encSession) {
          await supabase.from('customers').update({ casino_token: null, casino_profile: null }).eq('id', customer.id)
          await sendAndSave(ctx, conversation.id, 'Primero necesitás iniciar sesión.', { reply_markup: menuAuth() })
          break
        }
        const balance = await getBalance(decryptToken(encSession))
        if (balance === null) {
          await supabase.from('customers').update({ casino_token: null, casino_profile: null }).eq('id', customer.id)
          await sendAndSave(ctx, conversation.id, 'Tu sesión expiró. Ingresá de nuevo para continuar.', { reply_markup: menuAuth() })
        } else {
          await sendAndSave(ctx, conversation.id, `Tu saldo actual es: $${balance.toLocaleString('es-AR')} ARS\n\n¿Qué más querés hacer?`, { reply_markup: menuLoggedIn() })
        }
      } catch (err) {
        console.error('Balance callback error:', err)
        await supabase.from('customers').update({ casino_token: null, casino_profile: null }).eq('id', customer.id)
        await sendAndSave(ctx, conversation.id, 'Tu sesión expiró. Ingresá de nuevo para continuar.', { reply_markup: menuAuth() })
      }
      break
    }

    // ---- Transactions ----
    case 'menu:transactions': {
      if (!customer.casino_token) {
        await sendAndSave(ctx, conversation.id, 'Primero necesitás iniciar sesión.', { reply_markup: menuAuth() })
        break
      }
      try {
        const transactions = await getTransactions(decryptToken(customer.casino_token))
        if (transactions.length === 0) {
          await sendAndSave(ctx, conversation.id, 'No encontré movimientos registrados en tu cuenta.\n\n¿Qué más querés hacer?', { reply_markup: menuLoggedIn() })
        } else {
          const lines = transactions.slice(0, 5).map((t: any) => {
            const tipo = t.t || 'Movimiento'
            const estado = t.st || '---'
            const monto = t.a ? `$${t.a.toLocaleString('es-AR')} ARS` : '---'
            const fecha = t.cat ? new Date(t.cat).toLocaleDateString('es-AR') : '---'
            return `• ${tipo} | ${estado} | ${monto} | ${fecha}`
          })
          await sendAndSave(ctx, conversation.id, `Tus últimos movimientos:\n\n${lines.join('\n')}\n\n¿Qué más querés hacer?`, { reply_markup: menuLoggedIn() })
        }
      } catch (err) {
        console.error('Transactions callback error:', err)
        await supabase.from('customers').update({ casino_token: null, casino_profile: null }).eq('id', customer.id)
        await sendAndSave(ctx, conversation.id, 'Tu sesión expiró. Ingresá de nuevo para continuar.', { reply_markup: menuAuth() })
      }
      break
    }

    // ---- Agent ----
    case 'start:agent':
    case 'menu:agent': {
      await sendAndSave(ctx, conversation.id,
        '¿Estás seguro de que querés hablar con un agente humano?',
        { reply_markup: confirmYesNo() })
      await supabase.from('conversations').update({
        pending_action: { type: 'awaiting_agent_confirmation', created_at: Date.now() },
      }).eq('id', conversation.id)
      break
    }

    // ---- Yes/No confirmations (based on pending_action) ----
    case 'confirm:yes': {
      const pending = conversation.pending_action
      if (!pending) break

      if (pending.type === 'awaiting_agent_confirmation') {
        await supabase.from('conversations').update({
          status: 'waiting_agent', ai_paused: true, pending_action: null,
        }).eq('id', conversation.id)
        await sendAndSave(ctx, conversation.id, 'Listo, ya te conecto con un agente. En breve alguien te va a atender. ¡Gracias por tu paciencia!')
      } else if (pending.type === 'awaiting_relogin_confirmation') {
        await supabase.from('customers').update({ casino_token: null, casino_username: null, casino_profile: null }).eq('id', customer.id)
        await supabase.from('conversations').update({ pending_action: null }).eq('id', conversation.id)
        await sendAndSave(ctx, conversation.id, 'Sesión cerrada. Enviame tu nombre de usuario para iniciar sesión.')
      } else if (pending.type === 'awaiting_register_confirm') {
        // This one is complex — let the text handler in message.ts handle it
        // Simulate a "sí" text message
        await sendAndSave(ctx, conversation.id, 'Procesando...')
        // We won't duplicate the register logic here — the user can also just type "sí"
        // Instead, we'll directly handle the YES path
        const { decryptToken: dt } = await import('../lib/crypto')
        const { registerCasino, loginCasino } = await import('../api/casino')
        const { encryptToken: et } = await import('../lib/crypto')
        const operator = ctx.casinoOperator ?? 'DEFAULT'
        const plainPassword = dt(pending.password as string)

        await supabase.from('conversations').update({ pending_action: null }).eq('id', conversation.id)

        try {
          const success = await registerCasino({
            username: pending.username as string,
            password: plainPassword,
            operator,
          })

          if (success) {
            const loginResult = await loginCasino(pending.username as string, plainPassword, ctx.from!.id, ctx.from!.username, operator)
            if (loginResult) {
              const profileWithEncSession = { ...loginResult.profile, session: et(loginResult.session) }
              await supabase.from('customers').update({
                casino_username: pending.username as string,
                casino_token: et(loginResult.jwt),
                casino_profile: profileWithEncSession as any,
              }).eq('id', customer.id)
              await sendAndSave(ctx, conversation.id, `¡Cuenta creada e iniciaste sesión, ${pending.username}! 🎉\n\n¿Qué querés hacer?`, { reply_markup: menuLoggedIn() })
            } else {
              await supabase.from('customers').update({ casino_username: pending.username as string }).eq('id', customer.id)
              await sendAndSave(ctx, conversation.id, `¡Cuenta creada exitosamente, ${pending.username}! 🎉\n\nNo pude iniciar sesión automáticamente. Tocá el botón para ingresar:`, { reply_markup: menuAuth() })
            }
          } else {
            await supabase.from('conversations').update({
              pending_action: { type: 'awaiting_register_new_username', password: pending.password, created_at: Date.now() },
            }).eq('id', conversation.id)
            await sendAndSave(ctx, conversation.id, 'No se pudo crear la cuenta. Es posible que el usuario ya esté en uso. Probá con otro nombre de usuario:')
          }
        } catch (err: any) {
          if (err.message === 'casino_user_exists') {
            await supabase.from('conversations').update({
              pending_action: { type: 'awaiting_register_new_username', password: pending.password, created_at: Date.now() },
            }).eq('id', conversation.id)
            await sendAndSave(ctx, conversation.id, 'Ese usuario ya está en uso. Elegí otro nombre de usuario (tu contraseña se mantiene).')
          } else {
            await supabase.from('conversations').update({
              pending_action: { type: 'awaiting_register_new_username', password: pending.password, created_at: Date.now() },
            }).eq('id', conversation.id)
            await sendAndSave(ctx, conversation.id, 'No se pudo crear la cuenta. Es posible que el usuario ya esté en uso o haya un problema temporal. Probá con otro nombre de usuario:')
          }
        }
      }
      break
    }

    case 'confirm:no': {
      const pending = conversation.pending_action
      if (!pending) break

      if (pending.type === 'awaiting_agent_confirmation') {
        await supabase.from('conversations').update({ pending_action: null }).eq('id', conversation.id)
        let validSession = false
        if (customer.casino_token) {
          try {
            validSession = await validateJwtQuick(decryptToken(customer.casino_token))
          } catch {
            await supabase.from('customers').update({ casino_token: null, casino_profile: null }).eq('id', customer.id)
          }
        }
        const kb = validSession ? menuLoggedIn() : menuNotLoggedIn()
        await sendAndSave(ctx, conversation.id, 'Perfecto, seguimos acá. ¿En qué más puedo ayudarte?', { reply_markup: kb })
      } else if (pending.type === 'awaiting_relogin_confirmation') {
        await supabase.from('conversations').update({ pending_action: null }).eq('id', conversation.id)
        const currentUser = pending.casino_username as string
        await sendAndSave(ctx, conversation.id, `Perfecto, seguís con la cuenta "${currentUser}". ¿En qué te puedo ayudar?`, { reply_markup: menuLoggedIn() })
      } else if (pending.type === 'awaiting_register_confirm') {
        await supabase.from('conversations').update({
          pending_action: { type: 'awaiting_register_password', username: pending.username, created_at: Date.now() },
        }).eq('id', conversation.id)
        await sendAndSave(ctx, conversation.id, 'OK, elegí otra contraseña (entre 8 y 30 caracteres).')
      }
      break
    }
  }
}
