import { Bot, Context } from 'grammy'
import { handleStart } from './handlers/start'
import { handleTextMessage } from './handlers/message'
import { handlePhoto } from './handlers/photo'
import { handleDocument } from './handlers/document'

export interface BotContext extends Context {
  botId: string
  botToken: string
  welcomeMessage: string | null
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
  casinoOperator?: string | null
) {
  const bot = new Bot<BotContext>(token)

  // Store welcome message, can be updated at runtime
  let currentWelcomeMessage = welcomeMessage ?? null

  // Inject botId, botToken, welcomeMessage and AI/casino config into every context
  bot.use((ctx, next) => {
    ctx.botId = botId
    ctx.botToken = token
    ctx.welcomeMessage = currentWelcomeMessage
    ctx.aiEnabled = aiEnabled ?? false
    ctx.aiSystemPrompt = aiSystemPrompt ?? null
    ctx.aiModel = aiModel ?? 'gpt-4o'
    ctx.aiMaxHistory = aiMaxHistory ?? 15
    ctx.casinoOperator = casinoOperator ?? null
    return next()
  })

  // Allow updating welcome message without restarting
  ;(bot as any).setWelcomeMessage = (msg: string | null) => {
    currentWelcomeMessage = msg
  }

  // Error handler
  bot.catch((err) => {
    console.error(`Bot ${botId} error:`, err)
  })

  // Commands
  bot.command('start', handleStart)

  // Separate handlers for each message type
  bot.on('message:photo', handlePhoto)
  bot.on('message:document', handleDocument)
  bot.on('message:text', handleTextMessage)

  return bot
}
