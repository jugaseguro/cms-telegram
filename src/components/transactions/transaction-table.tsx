'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TableSkeleton } from '@/components/ui/page-skeleton'
import { format } from 'date-fns'
import { CheckCircle, XCircle, Image, Download, Eye } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TRANSACTION_STATUS_COLORS } from '@/lib/constants'
import type { Transaction, Customer, Profile } from '@/lib/supabase/types'

const supabase = createClient()

type TransactionWithRelations = Transaction & {
  customers: Customer
  profiles: Profile
}

export function TransactionTable() {
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'rejected'>('all')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['transactions', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select('id, customer_id, agent_id, amount, status, receipt_url, notes, created_at, customers(first_name, last_name), profiles!transactions_agent_id_fkey(full_name)')
        .order('created_at', { ascending: false })

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      const { data, error } = await query
      if (error) throw error
      return data as TransactionWithRelations[]
    },
  })

  const updateStatus = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string
      status: 'confirmed' | 'rejected'
    }) => {
      const { error } = await supabase
        .from('transactions')
        .update({ status })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Estado actualizado')
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="max-w-[200px]">
          <div className="h-8 w-full rounded-lg bg-muted animate-pulse" />
        </div>
        <TableSkeleton columns={8} rows={6} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="max-w-[200px]">
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as 'all' | 'pending' | 'confirmed' | 'rejected')}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendientes</SelectItem>
            <SelectItem value="confirmed">Confirmados</SelectItem>
            <SelectItem value="rejected">Rechazados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead>Agente</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Comprobante</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead>Fecha</TableHead>
              {profile?.role === 'admin' && <TableHead>Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions?.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell>
                  {[tx.customers?.first_name, tx.customers?.last_name]
                    .filter(Boolean)
                    .join(' ') || '-'}
                </TableCell>
                <TableCell className="font-medium">${tx.amount}</TableCell>
                <TableCell>{tx.profiles?.full_name || '-'}</TableCell>
                <TableCell>
                  <Badge className={TRANSACTION_STATUS_COLORS[tx.status]}>
                    {tx.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {tx.receipt_url ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setPreviewUrl(tx.receipt_url)}
                        title="Ver comprobante"
                      >
                        <Eye className="h-4 w-4 text-primary" />
                      </Button>
                      <a
                        href={tx.receipt_url}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Descargar comprobante"
                      >
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Download className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </a>
                    </div>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {tx.notes || '-'}
                </TableCell>
                <TableCell>
                  {format(new Date(tx.created_at), 'dd/MM/yyyy HH:mm')}
                </TableCell>
                {profile?.role === 'admin' && (
                  <TableCell>
                    {tx.status === 'pending' && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            updateStatus.mutate({
                              id: tx.id,
                              status: 'confirmed',
                            })
                          }
                        >
                          <CheckCircle className="h-4 w-4 text-status-success-icon" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            updateStatus.mutate({
                              id: tx.id,
                              status: 'rejected',
                            })
                          }
                        >
                          <XCircle className="h-4 w-4 text-status-error-icon" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {/* Receipt preview dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Comprobante</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <div className="space-y-3">
              <img
                src={previewUrl}
                alt="Comprobante"
                className="w-full rounded-lg"
              />
              <a
                href={previewUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" className="w-full">
                  <Download className="mr-2 h-4 w-4" />
                  Descargar imagen
                </Button>
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
