'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CustomerDetailDialog } from './customer-detail-dialog'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Search, Eye, UsersRound } from 'lucide-react'
import { TableSkeleton } from '@/components/ui/page-skeleton'
import { QueryError } from '@/components/ui/query-error'
import { CUSTOMER_STATUS_COLORS } from '@/lib/constants'
import { useAuthStore } from '@/stores/auth-store'
import type { Customer, Transaction } from '@/lib/supabase/types'

const supabase = createClient()

type CustomerStats = {
  totalLoads: number
  confirmedLoads: number
  totalAmount: number
  lastLoadDate: string | null
}

function computeCustomerStats(
  transactions: Transaction[],
  customerId: string
): CustomerStats {
  const customerTxs = transactions.filter((t) => t.customer_id === customerId)
  const confirmed = customerTxs.filter((t) => t.status === 'confirmed')
  const sorted = confirmed.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  return {
    totalLoads: customerTxs.length,
    confirmedLoads: confirmed.length,
    totalAmount: confirmed.reduce((sum, t) => sum + Number(t.amount), 0),
    lastLoadDate: sorted[0]?.created_at ?? null,
  }
}

export function CustomerTable() {
  const [search, setSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const isInitialized = useAuthStore((s) => s.isInitialized)

  const { data: customers, isLoading, isError, refetch } = useQuery({
    queryKey: ['customers'],
    enabled: isInitialized,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, telegram_id, telegram_username, first_name, last_name, phone, status, has_paid, created_at')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data as Customer[]
    },
  })

  const { data: allTransactions } = useQuery({
    queryKey: ['all-transactions-for-customers'],
    enabled: isInitialized,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, customer_id, amount, status, created_at')
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return data as Transaction[]
    },
  })

  const statsMap = useMemo(() => {
    if (!allTransactions) return null
    const map = new Map<string, CustomerStats>()
    for (const customer of customers ?? []) {
      map.set(customer.id, computeCustomerStats(allTransactions, customer.id))
    }
    return map
  }, [allTransactions, customers])

  const filtered = customers?.filter((c) => {
    if (!search) return true
    const text =
      [c.first_name, c.last_name, c.telegram_username, String(c.telegram_id)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
    return text.includes(search.toLowerCase())
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="relative max-w-sm">
          <div className="h-9 w-full rounded-md bg-muted animate-pulse" />
        </div>
        <TableSkeleton columns={10} rows={6} />
      </div>
    )
  }

  if (isError) {
    return <QueryError onRetry={refetch} />
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar clientes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Telegram ID</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Cargas</TableHead>
              <TableHead>Monto total</TableHead>
              <TableHead>Última carga</TableHead>
              <TableHead>Registrado</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered?.length === 0 && !isLoading && (
              <TableRow>
                <TableCell colSpan={10}>
                  <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                    <UsersRound className="h-8 w-8" />
                    <p className="text-sm">No se encontraron clientes</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {filtered?.map((customer) => {
              const stats = statsMap?.get(customer.id) ?? null

              return (
                <TableRow key={customer.id} style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 48px' }}>
                  <TableCell className="font-medium">
                    {[customer.first_name, customer.last_name]
                      .filter(Boolean)
                      .join(' ') || '-'}
                  </TableCell>
                  <TableCell>{customer.telegram_username || '-'}</TableCell>
                  <TableCell>{customer.telegram_id}</TableCell>
                  <TableCell>{customer.phone || '-'}</TableCell>
                  <TableCell>
                    <Badge className={CUSTOMER_STATUS_COLORS[customer.status]}>
                      {customer.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {stats ? (
                      <span className="font-medium">
                        {stats.confirmedLoads}
                        {stats.totalLoads !== stats.confirmedLoads && (
                          <span className="text-muted-foreground text-xs">
                            /{stats.totalLoads}
                          </span>
                        )}
                      </span>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {stats && stats.totalAmount > 0 ? (
                      <span className="font-medium text-status-success-text">
                        ${stats.totalAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {stats?.lastLoadDate ? (
                      <span className="text-sm" title={format(new Date(stats.lastLoadDate), 'dd/MM/yyyy HH:mm')}>
                        {formatDistanceToNow(new Date(stats.lastLoadDate), {
                          addSuffix: true,
                          locale: es,
                        })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {format(new Date(customer.created_at), 'dd/MM/yyyy')}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedCustomer(customer)
                        setDialogOpen(true)
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <CustomerDetailDialog
        customer={selectedCustomer}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}
