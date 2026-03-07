import 'dotenv/config'
import { createBot } from './bot'
import { webhookCallback } from 'grammy'
import { createServer } from 'http'
import { startRecontactCron } from './cron/recontact'

const BOT_TOKEN = process.env.BOT_TOKEN!
const PORT = parseInt(process.env.PORT || '3001')
const WEBHOOK_URL = process.env.WEBHOOK_URL
const MODE = process.env.MODE || 'polling' // 'polling' | 'webhook'

const bot = createBot(BOT_TOKEN)

async function start() {
  if (MODE === 'webhook' && WEBHOOK_URL) {
    // Webhook mode (for Railway)
    await bot.api.setWebhook(`${WEBHOOK_URL}/webhook`)

    const server = createServer(async (req, res) => {
      if (req.url === '/webhook' && req.method === 'POST') {
        const handler = webhookCallback(bot, 'http')
        await handler(req, res)
      } else if (req.url === '/health') {
        res.writeHead(200)
        res.end('OK')
      } else {
        res.writeHead(404)
        res.end()
      }
    })

    server.listen(PORT, () => {
      console.log(`Bot webhook server running on port ${PORT}`)
    })
  } else {
    // Polling mode (for development)
    await bot.api.deleteWebhook()
    console.log('Bot started in polling mode...')
    bot.start()
  }

  // Start recontact cron job
  startRecontactCron(bot)
}

start().catch(console.error)
