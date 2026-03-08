import 'dotenv/config'
import { createBot } from './bot'
import { createServer, type IncomingMessage } from 'http'
import { startRecontactCron } from './cron/recontact'

const BOT_TOKEN = process.env.BOT_TOKEN!
const PORT = parseInt(process.env.PORT || '3001')
const WEBHOOK_URL = process.env.WEBHOOK_URL
const MODE = process.env.MODE || 'polling' // 'polling' | 'webhook'

const bot = createBot(BOT_TOKEN)

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

async function start() {
  if (MODE === 'webhook' && WEBHOOK_URL) {
    // Webhook mode (for Railway)
    await bot.api.setWebhook(`${WEBHOOK_URL}/webhook`)

    const server = createServer(async (req, res) => {
      if (req.url === '/webhook' && req.method === 'POST') {
        // Read body and respond 200 immediately to prevent Telegram retries
        const body = await readBody(req)
        res.writeHead(200)
        res.end()

        // Process update in background
        try {
          const update = JSON.parse(body)
          bot.handleUpdate(update).catch((err) => {
            console.error(`Error processing update ${update.update_id}:`, err)
          })
        } catch (err) {
          console.error('Failed to parse webhook body:', err)
        }
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
