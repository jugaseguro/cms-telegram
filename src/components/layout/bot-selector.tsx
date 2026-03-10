'use client'

import { useBotStore } from '@/stores/bot-store'
import { useBots } from '@/hooks/use-bots'
import { Bot } from 'lucide-react'

export function BotSelector() {
  const { data: bots } = useBots()
  const { selectedBotId, selectBot } = useBotStore()

  if (!bots || bots.length <= 1) return null

  return (
    <div className="px-3 pb-1">
      <div className="relative">
        <select
          value={selectedBotId ?? ''}
          onChange={(e) => selectBot(e.target.value || null)}
          className="w-full appearance-none rounded-lg border bg-background/60 px-3 py-2 pl-8 text-sm font-medium text-foreground transition-colors hover:bg-accent/60 focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
        >
          <option value="">Todos los bots</option>
          {bots.map((bot) => (
            <option key={bot.id} value={bot.id}>
              {bot.name}
            </option>
          ))}
        </select>
        <Bot className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        {selectedBotId && (
          <span
            className="absolute right-8 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
            style={{ backgroundColor: bots.find((b) => b.id === selectedBotId)?.color ?? '#3b82f6' }}
          />
        )}
      </div>
    </div>
  )
}
