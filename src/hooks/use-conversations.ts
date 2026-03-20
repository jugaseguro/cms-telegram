import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { useBotStore } from '@/stores/bot-store'
import type { ConversationWithCustomerAndLabels } from '@/lib/supabase/types'

const supabase = createClient()
const FETCH_TIMEOUT_MS = 15_000

export function useConversations() {
  const isInitialized = useAuthStore((s) => s.isInitialized)
  const selectedBotId = useBotStore((s) => s.selectedBotId)

  return useQuery({
    queryKey: ['conversations', selectedBotId],
    enabled: isInitialized,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      console.log(`[useConversations] Fetching conversations list...`)
      const startTime = Date.now()

      let query = supabase
        .from('conversations')
        .select('id, customer_id, assigned_agent_id, status, last_message_at, waiting_since, first_response_at, bot_id, created_at, ai_paused, customers(id, telegram_id, telegram_username, first_name, last_name, phone, status, has_paid, last_activity, bot_id, created_at), profiles(id, full_name), bots(id, name, color, telegram_username, is_active, created_at), conversation_labels(label_id, labels(*))')
        .order('last_message_at', { ascending: false })
        .limit(150)

      if (selectedBotId) {
        query = query.eq('bot_id', selectedBotId)
      }

      const fetchPromise = query.then(({ data, error }) => {
        const elapsed = Date.now() - startTime
        console.log(`[useConversations] Fetch complete in ${elapsed}ms`, { count: data?.length, error })
        if (error) throw error
        return data as ConversationWithCustomerAndLabels[]
      })

      const timeoutPromise = new Promise<ConversationWithCustomerAndLabels[]>((_, reject) =>
        setTimeout(() => {
          console.warn(`[useConversations] Fetch timed out after ${FETCH_TIMEOUT_MS}ms`)
          reject(new Error('SUPABASE_TIMEOUT'))
        }, FETCH_TIMEOUT_MS)
      )

      return Promise.race([fetchPromise, timeoutPromise])
    },
    refetchOnWindowFocus: false,  // Realtime handles live updates — prevents refetch storm on tab focus
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

export function useToggleAiPaused() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      conversationId,
      aiPaused,
    }: {
      conversationId: string
      aiPaused: boolean
    }) => {
      const { error } = await supabase
        .from('conversations')
        .update({ ai_paused: aiPaused })
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
