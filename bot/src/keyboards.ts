import { InlineKeyboard } from 'grammy'

/** Main menu for users NOT logged in */
export function menuNotLoggedIn() {
  return new InlineKeyboard()
    .text('📝 Crear usuario', 'menu:register').row()
    .text('🔑 Ya tengo cuenta', 'menu:login').row()
    .text('❓ Hablar con agente', 'menu:agent')
}

/** Main menu for logged-in users */
export function menuLoggedIn() {
  return new InlineKeyboard()
    .text('💰 Ver mi saldo', 'menu:balance').row()
    .text('📥 Depositar', 'menu:deposit').row()
    .text('📤 Retirar', 'menu:withdraw').row()
    .text('📋 Ver mis movimientos', 'menu:transactions').row()
    .text('👤 Hablar con un agente', 'menu:agent')
}

/** Start menu (welcome) — all options */
export function menuStart() {
  return new InlineKeyboard()
    .text('📝 Crear usuario', 'menu:register').row()
    .text('🔑 Ya tengo cuenta', 'menu:login').row()
    .text('💰 Quiero cargar', 'menu:deposit').row()
    .text('❓ Hablar con agente', 'menu:agent')
}

/** Yes / No confirmation */
export function confirmYesNo() {
  return new InlineKeyboard()
    .text('✅ Sí', 'confirm:yes')
    .text('❌ No', 'confirm:no')
}

/** Withdrawal method selection */
export function withdrawMethod() {
  return new InlineKeyboard()
    .text('🏦 Transferencia Bancaria', 'withdraw:bt').row()
    .text('💜 Mercado Pago', 'withdraw:mp')
}

/** Login or register (when deposit requires auth) */
export function menuAuth() {
  return new InlineKeyboard()
    .text('📝 Crear usuario', 'menu:register').row()
    .text('🔑 Ya tengo cuenta', 'menu:login')
}
