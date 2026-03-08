import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import type { ConversationWithCustomerAndLabels } from '@/lib/supabase/types'

const supabase = createClient()

export function useConversations() {
  const isInitialized = useAuthStore((s) => s.isInitialized)

  return useQuery({
    queryKey: ['conversations'],
    enabled: isInitialized,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('id, customer_id, assigned_agent_id, status, last_message_at, waiting_since, first_response_at, created_at, customers(id, telegram_id, telegram_username, first_name, last_name, phone, status, has_paid, created_at), profiles(id, full_name), conversation_labels(label_id, labels(*))')
        .order('last_message_at', { ascending: false })

      if (error) throw error
      return data as ConversationWithCustomerAndLabels[]
    },
  })
}

export function useAssignConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      conversationId,
      agentId,
    }: {
      conversationId: string
      agentId: string
    }) => {
      const { error } = await supabase
        .from('conversations')
        .update({ assigned_agent_id: agentId })
        .eq('id', conversationId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}

export function useUpdateConversationStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      conversationId,
      status,
    }: {
      conversationId: string
      status: 'open' | 'closed' | 'pending'
    }) => {
      const { error } = await supabase
        .from('conversations')
        .update({ status })
        .eq('id', conversationId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}
