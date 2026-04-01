import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { useBotStore } from '@/stores/bot-store'
import type { ConversationWithCustomerAndLabels } from '@/lib/supabase/types'

const FETCH_TIMEOUT_MS = 30_000

export function useConversations() {
  const isInitialized = useAuthStore((s) => s.isInitialized)
  const selectedBotId = useBotStore((s) => s.selectedBotId)

  return useQuery({
    queryKey: ['conversations', selectedBotId],
    enabled: isInitialized,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const supabase = createClient()
      console.log(`[useConversations] Fetching conversations list...`)
      const startTime = Date.now()

      let query = supabase
        .from('conversations')
        .select('id, customer_id, assigned_agent_id, status, last_message_at, waiting_since, first_response_at, bot_id, created_at, ai_paused, pending_action, customers(id, telegram_id, telegram_username, first_name, last_name, has_paid, bot_id), profiles(id, full_name), bots(id, name, color), conversation_labels(label_id, labels(id, name, color))')
        .order('last_message_at', { ascending: false })
        .limit(150)

      if (selectedBotId) {
        query = query.eq('bot_id', selectedBotId)
      }

      const fetchPromise = query.then(({ data, error }) => {
        const elapsed = Date.now() - startTime
        console.log(`[useConversations] Fetch complete in ${elapsed}ms`, { count: data?.length, error })
        if (error) throw error
        return data as unknown as ConversationWithCustomerAndLabels[]
      })

      // Timeout with proper cleanup — the timer is cleared when the fetch
      // completes first, preventing phantom rejections that pile up and
      // congest the auth lock on frequent invalidations.
      let timeoutId: ReturnType<typeof setTimeout>
      const timeoutPromise = new Promise<ConversationWithCustomerAndLabels[]>((_, reject) => {
        timeoutId = setTimeout(() => {
          console.warn(`[useConversations] Fetch timed out after ${FETCH_TIMEOUT_MS}ms`)
          reject(new Error('SUPABASE_TIMEOUT'))
        }, FETCH_TIMEOUT_MS)
      })

      // Also abort on React Query cancellation (e.g. component unmount, new query)
      signal?.addEventListener('abort', () => clearTimeout(timeoutId))

      try {
        const result = await Promise.race([fetchPromise, timeoutPromise])
        return result
      } finally {
        clearTimeout(timeoutId!)
      }
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
      const supabase = createClient()
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
      const supabase = createClient()
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
      const supabase = createClient()
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
