import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { withTimeout } from '@/lib/timeout'
import { useAuthStore } from '@/stores/auth-store'
import type { Label, CustomerLabelWithDetails } from '@/lib/supabase/types'
import { toast } from 'sonner'

const MUTATION_TIMEOUT_MS = 12_000

export function useCustomerLabels(customerId: string) {
  const isInitialized = useAuthStore((s) => s.isInitialized)

  return useQuery({
    queryKey: ['customer-labels', customerId],
    enabled: isInitialized,
    staleTime: 120_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('customer_labels')
        .select('label_id, assigned_by, labels(id, name, color)')
        .eq('customer_id', customerId)
      if (error) throw error
      return data as CustomerLabelWithDetails[]
    },
  })
}

export function useToggleCustomerLabel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      customerId,
      labelId,
      isActive,
    }: {
      customerId: string
      labelId: string
      isActive: boolean
    }) => {
      const supabase = createClient()
      if (isActive) {
        const { error } = await withTimeout(
          supabase
            .from('customer_labels')
            .delete()
            .eq('customer_id', customerId)
            .eq('label_id', labelId),
          MUTATION_TIMEOUT_MS,
          'CUSTOMER_LABEL_TIMEOUT'
        )
        if (error) throw error
      } else {
        const { error } = await withTimeout(
          supabase
            .from('customer_labels')
            .insert({ customer_id: customerId, label_id: labelId, assigned_by: 'manual' }),
          MUTATION_TIMEOUT_MS,
          'CUSTOMER_LABEL_TIMEOUT'
        )
        if (error) throw error
      }
    },
    onSuccess: (_, { customerId }) => {
      queryClient.invalidateQueries({ queryKey: ['customer-labels', customerId] })
    },
    onError: (error) => {
      toast.error(
        error.message === 'CUSTOMER_LABEL_TIMEOUT'
          ? 'La etiqueta del cliente tardó demasiado en guardarse.'
          : `No se pudo guardar la etiqueta del cliente: ${error.message}`
      )
    },
  })
}
