import 'dotenv/config'
import { BotManager } from './bot-manager'
import { startRecontactCron } from './cron/recontact'
import { startSegmentationCron } from './cron/segmentation'
import { createServer, type IncomingMessage } from 'http'
import { getSocketDiagnostics, initSocketServer } from './socket-server'

const PORT = parseInt(process.env.PORT || '3001')
const WEBHOOK_URL = process.env.WEBHOOK_URL
const MODE = process.env.MODE || 'polling' // 'polling' | 'webhook'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function writeJson(
  res: { writeHead: (status: number, headers?: Record<string, string>) => void; end: (body?: string) => void },
  status: number,
  payload: unknown
) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

async function start() {
  const manager = new BotManager()
  await manager.loadBots()

  if (manager.getAllBots().size === 0) {
    console.error('[main] No bots loaded. Exiting.')
    process.exit(1)
  }

  // Always create HTTP server (needed for Socket.IO in both modes)
  const server = createServer(async (req, res) => {
    if (MODE === 'webhook' && WEBHOOK_URL) {
      // Route: /webhook/:botId
      const match = req.url?.match(/^\/webhook\/([a-f0-9-]+)$/i)
      if (match && req.method === 'POST') {
        const botId = match[1]
        const bot = manager.getBot(botId)

        const body = await readBody(req)
        res.writeHead(200)
        res.end()

        if (!bot) {
          console.error(`[webhook] Unknown bot ID: ${botId}`)
          return
        }

        try {
          const update = JSON.parse(body)
          bot.handleUpdate(update).catch((err) => {
            console.error(`Error processing update for bot ${botId}:`, err)
          })
        } catch (err) {
          console.error('Failed to parse webhook body:', err)
        }
        return
      }
    }

    if (req.url === '/health') {
      writeJson(res, 200, {
        ok: true,
        service: 'bot',
        mode: MODE,
        time: new Date().toISOString(),
        checks: {
          process: 'up',
          webhookConfigured: MODE === 'webhook' ? Boolean(WEBHOOK_URL) : true,
          socketServer: Boolean(getSocketDiagnostics().initialized),
        },
      })
    } else if (req.url === '/diagnostics') {
      writeJson(res, 200, {
        ok: true,
        service: 'bot',
        mode: MODE,
        port: PORT,
        time: new Date().toISOString(),
        checks: {
          webhookConfigured: MODE === 'webhook' ? Boolean(WEBHOOK_URL) : true,
          encryptionConfigured: Boolean(process.env.ENCRYPTION_KEY),
          socketServer: Boolean(getSocketDiagnostics().initialized),
        },
        runtime: {
          botCount: manager.getAllBots().size,
          socket: getSocketDiagnostics(),
        },
      })
    } else {
      res.writeHead(404)
      res.end()
    }
  })

  // Initialize Socket.IO on the shared HTTP server
  initSocketServer(server)

  server.listen(PORT, () => {
    console.log(`Bot server running on port ${PORT} (mode: ${MODE})`)
  })

  if (MODE === 'webhook' && WEBHOOK_URL) {
    await manager.setupWebhooks(WEBHOOK_URL)
  } else {
    // Polling mode (for development)
    console.log('Starting bots in polling mode...')
    await manager.startPolling()
  }

  // Watch for bot changes in realtime (hot add/remove/update)
  manager.watchBotChanges()

  // Start cron jobs for all bots
  startRecontactCron(manager)
  startSegmentationCron(manager)
}

start().catch(console.error)
