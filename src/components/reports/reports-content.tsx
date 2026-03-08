'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
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

const supabase = createClient()

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

  const { data: stats } = useQuery({
    queryKey: ['reports-stats', period],
    queryFn: async () => {
      const [customers, conversations, txConfirmed, txPending, txAll, newCustomers] =
        await Promise.all([
          supabase
            .from('customers')
            .select('id', { count: 'exact', head: true }),
          supabase
            .from('conversations')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', range.start)
            .lte('created_at', range.end),
          supabase
            .from('transactions')
            .select('id, amount', { count: 'exact' })
            .eq('status', 'confirmed')
            .gte('created_at', range.start)
            .lte('created_at', range.end),
          supabase
            .from('transactions')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending')
            .gte('created_at', range.start)
            .lte('created_at', range.end),
          supabase
            .from('transactions')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', range.start)
            .lte('created_at', range.end),
          supabase
            .from('customers')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', range.start)
            .lte('created_at', range.end),
        ])

      const confirmedTotal = txConfirmed.data?.reduce(
        (sum, tx) => sum + Number(tx.amount),
        0
      ) ?? 0

      return {
        totalCustomers: customers.count ?? 0,
        newCustomers: newCustomers.count ?? 0,
        conversations: conversations.count ?? 0,
        confirmedTransactions: txConfirmed.count ?? 0,
        pendingTransactions: txPending.count ?? 0,
        totalTransactions: txAll.count ?? 0,
        confirmedAmount: confirmedTotal,
      }
    },
  })

  const { data: chartData } = useQuery({
    queryKey: ['reports-chart', period],
    queryFn: async () => {
      const [convData, txData, custData] = await Promise.all([
        supabase
          .from('conversations')
          .select('created_at')
          .gte('created_at', range.start)
          .lte('created_at', range.end)
          .order('created_at'),
        supabase
          .from('transactions')
          .select('created_at, status')
          .gte('created_at', range.start)
          .lte('created_at', range.end)
          .order('created_at'),
        supabase
          .from('customers')
          .select('created_at')
          .gte('created_at', range.start)
          .lte('created_at', range.end)
          .order('created_at'),
      ])

      return groupByPeriod(
        period,
        convData.data ?? [],
        txData.data ?? [],
        custData.data ?? []
      )
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
    </div>
  )
}

function groupByPeriod(
  period: Period,
  conversations: { created_at: string }[],
  transactions: { created_at: string; status: string }[],
  customers: { created_at: string }[]
) {
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

  for (const c of conversations) {
    ensureBucket(getKey(c.created_at)).conversaciones++
  }
  for (const t of transactions) {
    const b = ensureBucket(getKey(t.created_at))
    b.transacciones++
    if (t.status === 'confirmed') b.pagados++
  }
  for (const c of customers) {
    ensureBucket(getKey(c.created_at)).clientes++
  }

  // Fill in missing slots
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

  return Array.from(buckets.values()).sort((a, b) => {
    const keys = Array.from(buckets.keys())
    return keys.indexOf(a.label) - keys.indexOf(b.label)
  })
}
