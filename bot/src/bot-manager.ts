import { Bot } from 'grammy'
import { supabase } from './lib/supabase'
import { createBot, type BotContext } from './bot'
import type { BotConfig } from './lib/types'

export class BotManager {
  private bots = new Map<string, { bot: Bot<BotContext>; config: BotConfig }>()
  private mode: 'polling' | 'webhook' = 'polling'
  private webhookBaseUrl?: string

  async loadBots(): Promise<void> {
    const { data, error } = await supabase
      .from('bots')
      .select('id, name, token_encrypted, telegram_username, is_active, color, welcome_message')
      .eq('is_active', true)

    if (error) {
      console.error('[bot-manager] Error loading bots:', error.message)
      return
    }

    if (!data || data.length === 0) {
      console.warn('[bot-manager] No active bots found in database')
      return
    }

    for (const row of data) {
      const config: BotConfig = {
        id: row.id,
        name: row.name,
        token: row.token_encrypted,
        telegram_username: row.telegram_username,
        is_active: row.is_active,
        color: row.color,
        welcome_message: row.welcome_message,
      }

      const bot = createBot(config.token, config.id, config.welcome_message)
      this.bots.set(config.id, { bot, config })
      console.log(`[bot-manager] Loaded bot: ${config.name} (${config.id})`)
    }
  }

  async startPolling(): Promise<void> {
    this.mode = 'polling'
    for (const [id, { bot, config }] of this.bots) {
      try {
        await bot.api.deleteWebhook()
        bot.start()
        console.log(`[bot-manager] Bot "${config.name}" started in polling mode`)
      } catch (err) {
        console.error(`[bot-manager] Failed to start bot ${id}:`, err)
      }
    }
  }

  async setupWebhooks(baseUrl: string): Promise<void> {
    this.mode = 'webhook'
    this.webhookBaseUrl = baseUrl
    for (const [id, { bot, config }] of this.bots) {
      try {
        const webhookUrl = `${baseUrl}/webhook/${id}`
        await bot.api.setWebhook(webhookUrl)
        console.log(`[bot-manager] Webhook set for "${config.name}": ${webhookUrl}`)
      } catch (err) {
        console.error(`[bot-manager] Failed to set webhook for bot ${id}:`, err)
      }
    }
  }

  getBot(botId: string): Bot<BotContext> | undefined {
    return this.bots.get(botId)?.bot
  }

  getAllBots(): Map<string, { bot: Bot<BotContext>; config: BotConfig }> {
    return this.bots
  }

  async stopAll(): Promise<void> {
    for (const [, { bot }] of this.bots) {
      await bot.stop()
    }
    this.bots.clear()
  }

  /** Add and start a single bot */
  private async addBot(row: {
    id: string
    name: string
    token_encrypted: string
    telegram_username: string | null
    is_active: boolean
    color: string
    welcome_message?: string | null
  }): Promise<void> {
    if (this.bots.has(row.id)) return // already running

    const config: BotConfig = {
      id: row.id,
      name: row.name,
      token: row.token_encrypted,
      telegram_username: row.telegram_username,
      is_active: row.is_active,
      color: row.color,
      welcome_message: row.welcome_message ?? null,
    }

    const bot = createBot(config.token, config.id)
    this.bots.set(config.id, { bot, config })

    try {
      if (this.mode === 'webhook' && this.webhookBaseUrl) {
        const webhookUrl = `${this.webhookBaseUrl}/webhook/${config.id}`
        await bot.api.setWebhook(webhookUrl)
        console.log(`[bot-manager] Webhook set for "${config.name}": ${webhookUrl}`)
      } else {
        await bot.api.deleteWebhook()
        bot.start()
        console.log(`[bot-manager] Bot "${config.name}" started in polling mode`)
      }
      console.log(`[bot-manager] Hot-added bot: ${config.name} (${config.id})`)
    } catch (err) {
      console.error(`[bot-manager] Failed to start new bot ${config.id}:`, err)
      this.bots.delete(config.id)
    }
  }

  /** Stop and remove a single bot */
  private async removeBot(botId: string): Promise<void> {
    const entry = this.bots.get(botId)
    if (!entry) return

    try {
      await entry.bot.stop()
      console.log(`[bot-manager] Stopped bot: ${entry.config.name} (${botId})`)
    } catch (err) {
      console.error(`[bot-manager] Error stopping bot ${botId}:`, err)
    }
    this.bots.delete(botId)
  }

  /** Restart a bot with updated config (token change, etc.) */
  private async restartBot(row: {
    id: string
    name: string
    token_encrypted: string
    telegram_username: string | null
    is_active: boolean
    color: string
    welcome_message?: string | null
  }): Promise<void> {
    await this.removeBot(row.id)
    if (row.is_active) {
      await this.addBot(row)
    }
  }

  /** Subscribe to Supabase Realtime changes on the bots table */
  watchBotChanges(): void {
    supabase
      .channel('bot-manager-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bots' },
        async (payload) => {
          const { eventType } = payload

          if (eventType === 'INSERT') {
            const row = payload.new as any
            if (row.is_active) {
              console.log(`[bot-manager] New bot detected: ${row.name}`)
              await this.addBot(row)
            }
          } else if (eventType === 'UPDATE') {
            const row = payload.new as any
            const old = payload.old as any
            const isRunning = this.bots.has(row.id)

            // Bot deactivated → stop it
            if (!row.is_active && isRunning) {
              console.log(`[bot-manager] Bot deactivated: ${row.name}`)
              await this.removeBot(row.id)
              return
            }

            // Bot activated → start it
            if (row.is_active && !isRunning) {
              console.log(`[bot-manager] Bot activated: ${row.name}`)
              await this.addBot(row)
              return
            }

            // Token changed → restart
            if (row.token_encrypted !== old.token_encrypted && row.is_active) {
              console.log(`[bot-manager] Token changed for: ${row.name}, restarting...`)
              await this.restartBot(row)
              return
            }

            // Name/color/username changed → just update config in memory
            if (isRunning) {
              const entry = this.bots.get(row.id)!
              entry.config.name = row.name
              entry.config.color = row.color
              entry.config.telegram_username = row.telegram_username
              entry.config.welcome_message = row.welcome_message ?? null
              // Update welcome message on the bot instance without restart
              ;(entry.bot as any).setWelcomeMessage?.(entry.config.welcome_message)
              console.log(`[bot-manager] Config updated for: ${row.name}`)
            }
          } else if (eventType === 'DELETE') {
            const old = payload.old as any
            if (this.bots.has(old.id)) {
              console.log(`[bot-manager] Bot deleted: ${old.id}`)
              await this.removeBot(old.id)
            }
          }
        }
      )
      .subscribe((status, err) => {
        console.log(`[bot-manager] Realtime subscription status: ${status}`, err || '')
      })
  }
}
