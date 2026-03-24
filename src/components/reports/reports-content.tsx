'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { useBotStore } from '@/stores/bot-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Users,
  DollarSign,
  MessageSquare,
  TrendingUp,
  CheckCircle,
  UserPlus,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

const ReportsChart = dynamic(
  () => import('./reports-chart').then((m) => m.ReportsChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[430px] w-full rounded-xl" />,
  }
)

const BotComparison = dynamic(
  () => import('./bot-comparison').then((m) => m.BotComparison),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[300px] w-full rounded-xl" />,
  }
)

type Period = 'day' | 'month' | 'year'

function getDateRange(period: Period) {
  const now = new Date()
  const start = new Date(now)
  if (period === 'day') {
    start.setHours(0, 0, 0, 0)
  } else if (period === 'month') {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
  } else {
    start.setMonth(0, 1)
    start.setHours(0, 0, 0, 0)
  }
  return { start: start.toISOString(), end: now.toISOString() }
}

export function ReportsContent() {
  const [period, setPeriod] = useState<Period>('month')
  const range = useMemo(() => getDateRange(period), [period])

  const isInitialized = useAuthStore((s) => s.isInitialized)
  const selectedBotId = useBotStore((s) => s.selectedBotId)

  const { data: stats } = useQuery({
    queryKey: ['reports-stats', period, selectedBotId],
    enabled: isInitialized,
    queryFn: async () => {
      const supabase = createClient()
      const args: any = {
        p_start: range.start,
        p_end: range.end,
      }
      if (selectedBotId) args.p_bot_id = selectedBotId

      const { data, error } = await (supabase.rpc as any)('get_reports_stats', args)
      if (error) throw error

      const stats = data?.[0] || {
        total_customers: 0,
        new_customers: 0,
        total_conversations: 0,
        confirmed_transactions: 0,
        pending_transactions: 0,
        total_transactions: 0,
        confirmed_amount: 0
      }

      return {
        totalCustomers: Number(stats.total_customers || 0),
        newCustomers: Number(stats.new_customers || 0),
        conversations: Number(stats.total_conversations || 0),
        confirmedTransactions: Number(stats.confirmed_transactions || 0),
        pendingTransactions: Number(stats.pending_transactions || 0),
        totalTransactions: Number(stats.total_transactions || 0),
        confirmedAmount: Number(stats.confirmed_amount || 0),
      }
    },
  })

  const { data: chartData } = useQuery({
    queryKey: ['reports-chart', period, selectedBotId],
    enabled: isInitialized,
    queryFn: async () => {
      const supabase = createClient()
      const truncText = period === 'day' ? 'hour' : period === 'month' ? 'day' : 'month'
      const args: any = {
        p_trunc_text: truncText,
        p_start: range.start,
        p_end: range.end,
      }
      if (selectedBotId) args.p_bot_id = selectedBotId

      const { data, error } = await (supabase.rpc as any)('get_reports_chart_series', args)
      if (error) throw error

      return formatChartSeries(period, data || [])
    },
  })

  const periodLabels: Record<Period, string> = {
    day: 'Hoy',
    month: 'Este mes',
    year: 'Este año',
  }

  const cards = [
    {
      title: 'Clientes nuevos',
      value: stats?.newCustomers ?? 0,
      icon: UserPlus,
      color: 'bg-status-info-bg text-status-info-icon',
    },
    {
      title: 'Conversaciones',
      value: stats?.conversations ?? 0,
      icon: MessageSquare,
      color: 'bg-primary/10 text-primary',
    },
    {
      title: 'Transacciones confirmadas',
      value: stats?.confirmedTransactions ?? 0,
      icon: CheckCircle,
      color: 'bg-status-success-bg text-status-success-icon',
    },
    {
      title: 'Monto recaudado',
      value: `$${(stats?.confirmedAmount ?? 0).toLocaleString('es-AR')}`,
      icon: DollarSign,
      color: 'bg-status-warning-bg text-status-warning-icon',
    },
    {
      title: 'Tasa de pago',
      value: stats?.totalTransactions
        ? `${Math.round((stats.confirmedTransactions / stats.totalTransactions) * 100)}%`
        : '0%',
      icon: TrendingUp,
      color: 'bg-status-success-bg text-status-success-icon',
    },
    {
      title: 'Total clientes',
      value: stats?.totalCustomers ?? 0,
      icon: Users,
      color: 'bg-status-neutral-bg text-status-neutral-icon',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="inline-flex items-center gap-1 rounded-xl bg-muted/60 p-1">
        {(['day', 'month', 'year'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 cursor-pointer ${
              period === p
                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
            }`}
          >
            {periodLabels[p]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card, index) => (
          <Card
            key={card.title}
            className="group relative overflow-hidden border shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-primary/[0.03] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.color} transition-transform duration-300 group-hover:scale-110`}>
                <card.icon className="h-[18px] w-[18px]" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tracking-tight tabular-nums">
                {card.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {chartData && <ReportsChart data={chartData} period={period} />}

      {!selectedBotId && <BotComparison dateRange={range} />}
    </div>
  )
}

function formatChartSeries(period: Period, rows: any[]) {
  const buckets = new Map<
    string,
    { label: string; conversaciones: number; transacciones: number; clientes: number; pagados: number }
  >()

  function getKey(dateStr: string) {
    const d = new Date(dateStr)
    if (period === 'day') {
      return `${d.getHours().toString().padStart(2, '0')}:00`
    } else if (period === 'month') {
      return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`
    } else {
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
      return months[d.getMonth()]
    }
  }

  function ensureBucket(key: string) {
    if (!buckets.has(key)) {
      buckets.set(key, { label: key, conversaciones: 0, transacciones: 0, clientes: 0, pagados: 0 })
    }
    return buckets.get(key)!
  }

  // Fill in missing slots first to guarantee chronological sorting
  if (period === 'day') {
    const now = new Date().getHours()
    for (let h = 0; h <= now; h++) {
      ensureBucket(`${h.toString().padStart(2, '0')}:00`)
    }
  } else if (period === 'month') {
    const now = new Date()
    for (let d = 1; d <= now.getDate(); d++) {
      ensureBucket(`${d.toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}`)
    }
  } else {
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    const now = new Date().getMonth()
    for (let m = 0; m <= now; m++) {
      ensureBucket(months[m])
    }
  }

  // Populate actual data
  for (const row of rows) {
    if (!row.bucket) continue
    const b = ensureBucket(getKey(row.bucket))
    b.conversaciones += Number(row.conversations_count || 0)
    b.transacciones += Number(row.transactions_count || 0)
    b.pagados += Number(row.paid_transactions_count || 0)
    b.clientes += Number(row.customers_count || 0)
  }

  return Array.from(buckets.values()).sort((a, b) => {
    const keys = Array.from(buckets.keys())
    return keys.indexOf(a.label) - keys.indexOf(b.label)
  })
}
