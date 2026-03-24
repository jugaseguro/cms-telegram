'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { useBotStore } from '@/stores/bot-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquare, Users, DollarSign, TrendingUp } from 'lucide-react'

interface BotStats {
  botId: string
  botName: string
  botColor: string
  conversations: number
  customers: number
  confirmedTransactions: number
  confirmedAmount: number
}

interface BotComparisonProps {
  dateRange: { start: string; end: string }
}

export function BotComparison({ dateRange }: BotComparisonProps) {
  const isInitialized = useAuthStore((s) => s.isInitialized)
  const bots = useBotStore((s) => s.bots)

  const { data: botStats } = useQuery({
    queryKey: ['bot-comparison', dateRange.start, dateRange.end],
    enabled: isInitialized && bots.length > 1,
    queryFn: async (): Promise<BotStats[]> => {
      const supabase = createClient()
      const results: BotStats[] = []

      for (const bot of bots) {
        const [convs, custs, txs] = await Promise.all([
          supabase
            .from('conversations')
            .select('id', { count: 'exact', head: true })
            .eq('bot_id', bot.id)
            .gte('created_at', dateRange.start)
            .lte('created_at', dateRange.end),
          supabase
            .from('customers')
            .select('id', { count: 'exact', head: true })
            .eq('bot_id', bot.id)
            .gte('created_at', dateRange.start)
            .lte('created_at', dateRange.end),
          supabase
            .from('transactions')
            .select('id, amount', { count: 'exact' })
            .eq('bot_id', bot.id)
            .eq('status', 'confirmed')
            .gte('created_at', dateRange.start)
            .lte('created_at', dateRange.end),
        ])

        const confirmedAmount = txs.data?.reduce(
          (sum, tx) => sum + Number(tx.amount),
          0
        ) ?? 0

        results.push({
          botId: bot.id,
          botName: bot.name,
          botColor: bot.color,
          conversations: convs.count ?? 0,
          customers: custs.count ?? 0,
          confirmedTransactions: txs.count ?? 0,
          confirmedAmount,
        })
      }

      return results
    },
  })

  if (!botStats || botStats.length <= 1) return null

  const metrics = [
    { key: 'conversations' as const, label: 'Conversaciones', icon: MessageSquare },
    { key: 'customers' as const, label: 'Clientes nuevos', icon: Users },
    { key: 'confirmedTransactions' as const, label: 'Transacciones', icon: TrendingUp },
    { key: 'confirmedAmount' as const, label: 'Monto', icon: DollarSign, isCurrency: true },
  ]

  // Find max for each metric for the bar widths
  const maxValues = metrics.reduce((acc, m) => {
    acc[m.key] = Math.max(...botStats.map((b) => b[m.key]), 1)
    return acc
  }, {} as Record<string, number>)

  return (
    <Card className="shadow-sm border overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Comparación entre bots</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 sm:grid-cols-2">
          {metrics.map((metric) => (
            <div key={metric.key} className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <metric.icon className="h-4 w-4" />
                {metric.label}
              </div>
              <div className="space-y-2">
                {botStats.map((bot) => {
                  const value = bot[metric.key]
                  const pct = (value / maxValues[metric.key]) * 100
                  return (
                    <div key={bot.botId} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: bot.botColor }}
                          />
                          {bot.botName}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {metric.isCurrency
                            ? `$${value.toLocaleString('es-AR')}`
                            : value}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: bot.botColor,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
