'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquare, Users, DollarSign, Clock } from 'lucide-react'
import { DASHBOARD_CARDS_CONFIG } from '@/lib/constants'

const supabase = createClient()

interface Stats {
  totalConversations: number
  openConversations: number
  totalCustomers: number
  pendingTransactions: number
}

export function DashboardContent() {
  const isInitialized = useAuthStore((s) => s.isInitialized)

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    enabled: isInitialized,
    queryFn: async (): Promise<Stats> => {
      const [conversations, openConvs, customers, transactions] =
        await Promise.all([
          supabase.from('conversations').select('id', { count: 'exact', head: true }),
          supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('status', 'open'),
          supabase.from('customers').select('id', { count: 'exact', head: true }),
          supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        ])

      return {
        totalConversations: conversations.count ?? 0,
        openConversations: openConvs.count ?? 0,
        totalCustomers: customers.count ?? 0,
        pendingTransactions: transactions.count ?? 0,
      }
    },
  })

  const icons = { totalConversations: MessageSquare, openConversations: Clock, totalCustomers: Users, pendingTransactions: DollarSign }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {DASHBOARD_CARDS_CONFIG.map((card, index) => {
        const Icon = icons[card.key]
        return (
          <Card
            key={card.title}
            className="group relative overflow-hidden border shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5"
            style={{ animationDelay: `${index * 75}ms` }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-primary/[0.03] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.color} transition-transform duration-300 group-hover:scale-110`}>
                <Icon className="h-[18px] w-[18px]" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tracking-tight tabular-nums">{stats?.[card.key] ?? 0}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
