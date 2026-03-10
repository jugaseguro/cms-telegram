'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UploadReceipt } from './upload-receipt'
import { toast } from 'sonner'
import type { Customer } from '@/lib/supabase/types'

const supabase = createClient()

const schema = z.object({
  customer_id: z.string().min(1, 'Selecciona un cliente'),
  amount: z.string().min(1, 'Monto requerido'),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface RegisterTransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RegisterTransactionDialog({
  open,
  onOpenChange,
}: RegisterTransactionDialogProps) {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('first_name')
      if (error) throw error
      return data as Customer[]
    },
  })

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      // Look up the customer's bot_id
      const customer = customers?.find((c) => c.id === data.customer_id)
      const { error } = await supabase.from('transactions').insert({
        customer_id: data.customer_id,
        agent_id: user!.id,
        amount: parseFloat(data.amount),
        receipt_url: receiptUrl,
        notes: data.notes || null,
        bot_id: customer!.bot_id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Transaccion registrada')
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      reset()
      setReceiptUrl(null)
      onOpenChange(false)
    },
    onError: (err) => toast.error('Error: ' + err.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar carga de saldo</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((data) => mutation.mutate(data))}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Cliente</Label>
            <Select
              onValueChange={(value) => setValue('customer_id', value as string)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccionar cliente" />
              </SelectTrigger>
              <SelectContent>
                {customers?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {[c.first_name, c.last_name].filter(Boolean).join(' ') ||
                      c.telegram_username ||
                      `ID: ${c.telegram_id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.customer_id && (
              <p className="text-sm text-destructive">
                {errors.customer_id.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Monto</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              {...register('amount')}
            />
            {errors.amount && (
              <p className="text-sm text-destructive">
                {errors.amount.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" {...register('notes')} />
          </div>

          <UploadReceipt onUploaded={setReceiptUrl} />

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Registrando...' : 'Registrar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
