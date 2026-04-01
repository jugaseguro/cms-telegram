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
import dynamic from 'next/dynamic'

const CustomerDetailDialog = dynamic(
  () => import('./customer-detail-dialog').then((m) => ({ default: m.CustomerDetailDialog })),
  { ssr: false }
)
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Search, Eye, UsersRound } from 'lucide-react'
import { TableSkeleton } from '@/components/ui/page-skeleton'
import { QueryError } from '@/components/ui/query-error'
import { CUSTOMER_STATUS_COLORS } from '@/lib/constants'
import { useAuthStore } from '@/stores/auth-store'
import type { Customer } from '@/lib/supabase/types'

type CustomerStats = {
  customer_id: string
  total_loads: number
  confirmed_loads: number
  total_amount: number
  last_load_date: string | null
}

const ROW_STYLE = { contentVisibility: 'auto', containIntrinsicSize: 'auto 48px' } as const

export function CustomerTable() {
  const [search, setSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const isInitialized = useAuthStore((s) => s.isInitialized)

  const { data: customers, isLoading, isError, refetch } = useQuery({
    queryKey: ['customers'],
    enabled: isInitialized,
    staleTime: 120_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('customers')
        .select('id, telegram_id, telegram_username, first_name, last_name, phone, status, has_paid, created_at')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data as Customer[]
    },
  })

  const { data: customerStats } = useQuery({
    queryKey: ['customer-stats'],
    enabled: isInitialized,
    staleTime: 300_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_customer_stats')
      if (error) throw error
      return data as CustomerStats[]
    },
  })

  const statsMap = useMemo(() => {
    if (!customerStats) return null
    const map = new Map<string, CustomerStats>()
    for (const s of customerStats) {
      map.set(s.customer_id, s)
    }
    return map
  }, [customerStats])

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
                <TableRow key={customer.id} style={ROW_STYLE}>
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
                        {stats.confirmed_loads}
                        {stats.total_loads !== stats.confirmed_loads && (
                          <span className="text-muted-foreground text-xs">
                            /{stats.total_loads}
                          </span>
                        )}
                      </span>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {stats && stats.total_amount > 0 ? (
                      <span className="font-medium text-status-success-text">
                        ${Number(stats.total_amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {stats?.last_load_date ? (
                      <span className="text-sm" title={format(new Date(stats.last_load_date), 'dd/MM/yyyy HH:mm')}>
                        {formatDistanceToNow(new Date(stats.last_load_date), {
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
