'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { format, formatDistanceToNow, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { DollarSign, Hash, Clock, TrendingUp } from 'lucide-react'
import { TRANSACTION_STATUS_COLORS } from '@/lib/constants'
import type { Customer, Conversation, Transaction } from '@/lib/supabase/types'

interface CustomerDetailDialogProps {
  customer: Customer | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CustomerDetailDialog({
  customer,
  open,
  onOpenChange,
}: CustomerDetailDialogProps) {
  const { data: conversations } = useQuery({
    queryKey: ['customer-conversations', customer?.id],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('customer_id', customer!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Conversation[]
    },
    enabled: !!customer,
  })

  const { data: transactions } = useQuery({
    queryKey: ['customer-all-transactions', customer?.id],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('customer_id', customer!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Transaction[]
    },
    enabled: !!customer,
  })

  if (!customer) return null

  const name =
    [customer.first_name, customer.last_name].filter(Boolean).join(' ') ||
    customer.telegram_username ||
    `ID: ${customer.telegram_id}`

  // Compute transaction stats
  const { confirmed, pending, totalAmount, avgAmount, lastLoad, avgFrequency } = useMemo(() => {
    const conf = transactions?.filter((t) => t.status === 'confirmed') ?? []
    const pend = transactions?.filter((t) => t.status === 'pending') ?? []
    const total = conf.reduce((sum, t) => sum + Number(t.amount), 0)
    const avg = conf.length > 0 ? total / conf.length : 0
    const last = conf[0]?.created_at ?? null

    let freq: string | null = null
    if (conf.length >= 2) {
      const dates = conf.map((t) => new Date(t.created_at).getTime()).sort((a, b) => a - b)
      const totalDays = differenceInDays(new Date(dates[dates.length - 1]), new Date(dates[0]))
      const avgDays = Math.round(totalDays / (conf.length - 1))
      freq = avgDays === 0 ? 'Mismo día' : `Cada ~${avgDays} días`
    }

    return { confirmed: conf, pending: pend, totalAmount: total, avgAmount: avg, lastLoad: last, avgFrequency: freq }
  }, [transactions])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Telegram ID</p>
              <p className="font-medium">{customer.telegram_id}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Username</p>
              <p className="font-medium">
                {customer.telegram_username || '-'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Teléfono</p>
              <p className="font-medium">{customer.phone || '-'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Estado</p>
              <Badge variant="outline">{customer.status}</Badge>
            </div>
            <div>
              <p className="text-muted-foreground">Registrado</p>
              <p className="font-medium">
                {format(new Date(customer.created_at), 'dd/MM/yyyy HH:mm')}
              </p>
            </div>
          </div>

          <Separator />

          {/* Transaction summary stats */}
          <div>
            <h4 className="mb-3 font-semibold">Resumen de cargas</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 rounded-lg border p-3">
                <div className="rounded-md bg-primary/10 p-2">
                  <Hash className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cargas confirmadas</p>
                  <p className="text-lg font-bold">{confirmed.length}</p>
                  {pending.length > 0 && (
                    <p className="text-xs text-status-warning-text">
                      +{pending.length} pendientes
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border p-3">
                <div className="rounded-md bg-green-500/10 p-2">
                  <DollarSign className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Monto total</p>
                  <p className="text-lg font-bold">
                    ${totalAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </p>
                  {avgAmount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Promedio: ${avgAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border p-3">
                <div className="rounded-md bg-blue-500/10 p-2">
                  <Clock className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Última carga</p>
                  <p className="text-sm font-medium">
                    {lastLoad
                      ? formatDistanceToNow(new Date(lastLoad), {
                          addSuffix: true,
                          locale: es,
                        })
                      : 'Nunca'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border p-3">
                <div className="rounded-md bg-purple-500/10 p-2">
                  <TrendingUp className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Frecuencia</p>
                  <p className="text-sm font-medium">
                    {avgFrequency ?? (confirmed.length === 1 ? 'Solo 1 carga' : 'Sin datos')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Conversations */}
          <div>
            <h4 className="mb-2 font-semibold">
              Conversaciones ({conversations?.length ?? 0})
            </h4>
            <div className="space-y-2">
              {conversations?.map((conv) => (
                <div
                  key={conv.id}
                  className="flex items-center justify-between rounded border p-2 text-sm"
                >
                  <span>{format(new Date(conv.created_at), 'dd/MM/yyyy')}</span>
                  <Badge variant="outline">{conv.status}</Badge>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Transaction history */}
          <div>
            <h4 className="mb-2 font-semibold">
              Historial de cargas ({transactions?.length ?? 0})
            </h4>
            <div className="space-y-2">
              {transactions?.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded border p-2 text-sm"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">
                      ${Number(tx.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(tx.created_at), 'dd/MM/yyyy HH:mm')}
                    </span>
                  </div>
                  <Badge className={TRANSACTION_STATUS_COLORS[tx.status]}>
                    {tx.status}
                  </Badge>
                </div>
              ))}
              {transactions?.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin cargas registradas</p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
