import { Bot } from 'grammy'
import { handleStart } from './handlers/start'
import { handleTextMessage } from './handlers/message'
import { handlePhoto } from './handlers/photo'
import { handleDocument } from './handlers/document'

export function createBot(token: string) {
  const bot = new Bot(token)

  // Error handler
  bot.catch((err) => {
    console.error('Bot error:', err)
  })

  // Commands
  bot.command('start', handleStart)

  // Separate handlers for each message type
  bot.on('message:photo', handlePhoto)
  bot.on('message:document', handleDocument)
  bot.on('message:text', handleTextMessage)

  return bot
}
