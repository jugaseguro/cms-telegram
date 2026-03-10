import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Label, CustomerLabelWithDetails } from '@/lib/supabase/types'

const supabase = createClient()

export function useCustomerLabels(customerId: string) {
  return useQuery({
    queryKey: ['customer-labels', customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_labels')
        .select('*, labels(*)')
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
      if (isActive) {
        const { error } = await supabase
          .from('customer_labels')
          .delete()
          .eq('customer_id', customerId)
          .eq('label_id', labelId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('customer_labels')
          .insert({ customer_id: customerId, label_id: labelId, assigned_by: 'manual' })
        if (error) throw error
      }
    },
    onSuccess: (_, { customerId }) => {
      queryClient.invalidateQueries({ queryKey: ['customer-labels', customerId] })
    },
  })
}
