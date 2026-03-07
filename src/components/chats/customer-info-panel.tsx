'use client'

import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { UploadReceipt } from '@/components/transactions/upload-receipt'
import { format, formatDistanceToNow, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  Phone,
  AtSign,
  Calendar,
  DollarSign,
  Hash,
  Clock,
  TrendingUp,
  Plus,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { CUSTOMER_STATUS_COLORS, TRANSACTION_STATUS_COLORS } from '@/lib/constants'
import type { Customer, Transaction } from '@/lib/supabase/types'

const supabase = createClient()

const schema = z.object({
  amount: z.string().min(1, 'Monto requerido'),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface CustomerInfoPanelProps {
  customer: Customer
}

export function CustomerInfoPanel({ customer }: CustomerInfoPanelProps) {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [showAllTx, setShowAllTx] = useState(false)
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)

  const { data: transactions } = useQuery({
    queryKey: ['customer-transactions', customer.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, amount, status, notes, created_at')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Transaction[]
    },
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const { error } = await supabase.from('transactions').insert({
        customer_id: customer.id,
        agent_id: user!.id,
        amount: parseFloat(data.amount),
        receipt_url: receiptUrl,
        notes: data.notes || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Carga registrada')
      queryClient.invalidateQueries({ queryKey: ['customer-transactions', customer.id] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['all-transactions-for-customers'] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      reset()
      setReceiptUrl(null)
      setShowForm(false)
    },
    onError: (err) => toast.error('Error: ' + err.message),
  })

  const name =
    [customer.first_name, customer.last_name].filter(Boolean).join(' ') ||
    customer.telegram_username ||
    `ID: ${customer.telegram_id}`
  const initials = name.slice(0, 2).toUpperCase()

  // Stats
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

  const formatARS = (n: number) =>
    n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 })

  const visibleTx = showAllTx ? transactions : transactions?.slice(0, 5)

  return (
    <div className="space-y-4 p-4">
      {/* Profile header */}
      <div className="flex flex-col items-center gap-2 text-center">
        <Avatar className="h-16 w-16">
          <AvatarFallback className="text-lg">{initials}</AvatarFallback>
        </Avatar>
        <h3 className="font-semibold">{name}</h3>
        <Badge className={CUSTOMER_STATUS_COLORS[customer.status]}>
          {customer.status}
        </Badge>
      </div>

      <Separator />

      {/* Contact info */}
      <div className="space-y-3 text-sm">
        {customer.telegram_username && (
          <div className="flex items-center gap-2">
            <AtSign className="h-4 w-4 text-muted-foreground" />
            <span>{customer.telegram_username}</span>
          </div>
        )}
        {customer.phone && (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span>{customer.phone}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span>
            Desde {format(new Date(customer.created_at), 'dd/MM/yyyy')}
          </span>
        </div>
      </div>

      <Separator />

      {/* Resumen de cargas */}
      <div>
        <h4 className="mb-2 text-sm font-semibold">Resumen de cargas</h4>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-lg border p-2">
            <Hash className="h-4 w-4 text-primary" />
            <div>
              <p className="text-[11px] text-muted-foreground">Confirmadas</p>
              <p className="text-sm font-bold">{confirmed.length}</p>
              {pending.length > 0 && (
                <p className="text-[10px] text-status-warning-text">
                  +{pending.length} pend.
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border p-2">
            <DollarSign className="h-4 w-4 text-green-600" />
            <div>
              <p className="text-[11px] text-muted-foreground">Total</p>
              <p className="text-sm font-bold">{formatARS(totalAmount)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border p-2">
            <Clock className="h-4 w-4 text-blue-600" />
            <div>
              <p className="text-[11px] text-muted-foreground">Última carga</p>
              <p className="text-xs font-medium">
                {lastLoad
                  ? formatDistanceToNow(new Date(lastLoad), {
                      addSuffix: true,
                      locale: es,
                    })
                  : 'Nunca'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border p-2">
            <TrendingUp className="h-4 w-4 text-purple-600" />
            <div>
              <p className="text-[11px] text-muted-foreground">Frecuencia</p>
              <p className="text-xs font-medium">
                {avgFrequency ?? (confirmed.length === 1 ? '1 carga' : '-')}
              </p>
            </div>
          </div>
        </div>
        {avgAmount > 0 && (
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
            Promedio por carga: {formatARS(avgAmount)}
          </p>
        )}
      </div>

      <Separator />

      {/* Registrar carga */}
      <div>
        {!showForm ? (
          <Button
            className="w-full"
            size="sm"
            onClick={() => setShowForm(true)}
          >
            <Plus className="mr-1 h-4 w-4" />
            Registrar carga
          </Button>
        ) : (
          <form
            onSubmit={handleSubmit((data) => mutation.mutate(data))}
            className="space-y-3"
          >
            <h4 className="text-sm font-semibold">Nueva carga</h4>
            <div className="space-y-1">
              <Label htmlFor="panel-amount" className="text-xs">
                Monto (ARS)
              </Label>
              <Input
                id="panel-amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                {...register('amount')}
              />
              {errors.amount && (
                <p className="text-xs text-destructive">
                  {errors.amount.message}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="panel-notes" className="text-xs">
                Notas
              </Label>
              <Textarea
                id="panel-notes"
                rows={2}
                {...register('notes')}
              />
            </div>
            <UploadReceipt onUploaded={setReceiptUrl} />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setShowForm(false)
                  reset()
                  setReceiptUrl(null)
                }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="flex-1"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </form>
        )}
      </div>

      <Separator />

      {/* Historial de cargas */}
      <div>
        <h4 className="mb-2 text-sm font-semibold">
          Historial ({transactions?.length ?? 0})
        </h4>
        <div className="space-y-2">
          {visibleTx?.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between rounded-lg border p-2 text-xs"
            >
              <div className="flex flex-col">
                <span className="font-medium">
                  {formatARS(Number(tx.amount))}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {format(new Date(tx.created_at), 'dd/MM/yyyy HH:mm')}
                </span>
              </div>
              <Badge className={TRANSACTION_STATUS_COLORS[tx.status] + ' text-[10px]'}>
                {tx.status}
              </Badge>
            </div>
          ))}
          {transactions?.length === 0 && (
            <p className="text-xs text-muted-foreground">Sin cargas</p>
          )}
          {transactions && transactions.length > 5 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => setShowAllTx(!showAllTx)}
            >
              {showAllTx ? (
                <>
                  <ChevronUp className="mr-1 h-3 w-3" />
                  Ver menos
                </>
              ) : (
                <>
                  <ChevronDown className="mr-1 h-3 w-3" />
                  Ver todas ({transactions.length})
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
