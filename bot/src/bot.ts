import { Bot, Context } from 'grammy'
import { handleStart } from './handlers/start'
import { handleCallbackQuery } from './handlers/callbacks'
import { handleTextMessage } from './handlers/message'
import { handlePhoto } from './handlers/photo'
import { handleDocument } from './handlers/document'

export interface BotContext extends Context {
  botId: string
  botToken: string
  welcomeMessage: string | null
  // Pause config
  isPaused: boolean
  // AI config
  aiEnabled: boolean
  aiSystemPrompt: string | null
  aiModel: string
  aiMaxHistory: number
  // Casino config
  casinoOperator: string | null
}

export function createBot(
  token: string,
  botId: string,
  welcomeMessage?: string | null,
  aiEnabled?: boolean,
  aiSystemPrompt?: string | null,
  aiModel?: string,
  aiMaxHistory?: number,
  casinoOperator?: string | null,
  isPaused?: boolean
) {
  const bot = new Bot<BotContext>(token)

  let currentWelcomeMessage = welcomeMessage ?? null
  let currentIsPaused = isPaused ?? false

  // Inject botId, botToken, welcomeMessage and AI/casino config into every context
  bot.use((ctx, next) => {
    ctx.botId = botId
    ctx.botToken = token
    ctx.welcomeMessage = currentWelcomeMessage
    ctx.isPaused = currentIsPaused
    ctx.aiEnabled = aiEnabled ?? false
    ctx.aiSystemPrompt = aiSystemPrompt ?? null
    ctx.aiModel = aiModel ?? 'gpt-4o'
    ctx.aiMaxHistory = aiMaxHistory ?? 15
    ctx.casinoOperator = casinoOperator ?? null
    console.log(`[bot] ctx.isPaused =`, ctx.isPaused, 'for botId:', botId)
    return next()
  })

  // Allow updating welcome message without restarting
  ;(bot as any).setWelcomeMessage = (msg: string | null) => {
    currentWelcomeMessage = msg
  }

  // Allow updating paused state without restarting
  ;(bot as any).setIsPaused = (paused: boolean) => {
    console.log(`[bot] setIsPaused called with:`, paused, 'for bot:', botId)
    currentIsPaused = paused
  }

  // Error handler
  bot.catch((err) => {
    console.error(`Bot ${botId} error:`, err)
  })

  // Commands
  bot.command('start', handleStart)

  // Inline button callbacks
  bot.on('callback_query:data', handleCallbackQuery)

  // Separate handlers for each message type
  bot.on('message:photo', handlePhoto)
  bot.on('message:document', handleDocument)
  bot.on('message:text', handleTextMessage)

  return bot
}
