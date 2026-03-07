'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
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
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {DASHBOARD_CARDS_CONFIG.map((card) => {
        const Icon = icons[card.key]
        return (
          <Card key={card.title} className="shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.color}`}>
                <Icon className="h-[18px] w-[18px]" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tracking-tight tabular-nums">{stats?.[card.key] ?? 0}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
