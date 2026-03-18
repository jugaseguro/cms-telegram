import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Message } from '@/lib/supabase/types'

const supabase = createClient()

const MESSAGE_COLUMNS = 'id, conversation_id, sender_type, sender_id, content, message_type, media_url, telegram_message_id, is_internal, created_at'
const PAGE_SIZE = 50

interface PageCursor {
  created_at: string
  id: string
}

export function useMessages(conversationId: string | null) {
  const query = useInfiniteQuery({
    queryKey: ['messages', conversationId],
    queryFn: async ({ pageParam }) => {
      if (!conversationId) return []
      let q = supabase
        .from('messages')
        .select(MESSAGE_COLUMNS)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE)
      if (pageParam) {
        // Composite cursor: get messages older than cursor OR same timestamp with smaller id
        q = q.or(
          `created_at.lt.${pageParam.created_at},and(created_at.eq.${pageParam.created_at},id.lt.${pageParam.id})`
        )
      }
      const { data, error } = await q
      if (error) throw error
      return ((data as Message[]) ?? []).reverse()
    },
    initialPageParam: null as PageCursor | null,
    getNextPageParam: (lastPage): PageCursor | undefined => {
      if (lastPage.length < PAGE_SIZE) return undefined
      // Cursor is the oldest message in the page (first after reverse)
      const oldest = lastPage[0]
      if (!oldest) return undefined
      return { created_at: oldest.created_at, id: oldest.id }
    },
    select: (data) => ({
      ...data,
      messages: data.pages.flat(),
    }),
    enabled: !!conversationId,
    staleTime: 30_000,
    gcTime: 2 * 60 * 1000,
  })

  return {
    data: query.data?.messages ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  }
}

export function useSendMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      conversationId,
      content,
      senderId,
      senderType = 'agent',
      messageType = 'text',
      mediaUrl,
      isInternal = false,
    }: {
      conversationId: string
      content: string
      senderId: string
      senderType?: 'customer' | 'agent' | 'bot'
      messageType?: 'text' | 'image' | 'document' | 'receipt'
      mediaUrl?: string
      isInternal?: boolean
    }) => {
      // Insert message into DB
      const { data: message, error: msgError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          content,
          sender_type: senderType,
          sender_id: senderId,
          message_type: messageType,
          media_url: mediaUrl,
          is_internal: isInternal,
        })
        .select()
        .single()

      if (msgError) throw msgError

      // Skip Telegram delivery for internal notes
      if (isInternal) return message

      // Get customer telegram_id and bot_id to forward message
      const { data: conv } = await supabase
        .from('conversations')
        .select('customer_id, bot_id, customers(telegram_id)')
        .eq('id', conversationId)
        .single()

      const customer = conv?.customers as { telegram_id: number } | null
      if (customer) {
        const res = await fetch('/api/telegram/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId: customer.telegram_id,
            text: content || undefined,
            mediaUrl,
            messageType,
            botId: conv?.bot_id,
          }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          const errorMsg = (err as { error?: string }).error || 'Error desconocido'
          if (res.status === 429) {
            throw new Error(`Rate limit: ${errorMsg}`)
          }
          console.error('Telegram send failed:', err)
        }
      }

      return message
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: ['messages', variables.conversationId],
      })

      const previousData = queryClient.getQueryData(['messages', variables.conversationId])

      const optimisticMessage: Message = {
        id: `optimistic-${crypto.randomUUID()}`,
        conversation_id: variables.conversationId,
        sender_type: variables.senderType || 'agent',
        sender_id: variables.senderId ?? null,
        content: variables.content || null,
        message_type: variables.messageType || 'text',
        media_url: variables.mediaUrl ?? null,
        telegram_message_id: null,
        is_internal: variables.isInternal || false,
        created_at: new Date().toISOString(),
      }

      queryClient.setQueryData(
        ['messages', variables.conversationId],
        (old: { pages: Message[][]; pageParams: (PageCursor | null)[] } | undefined) => {
          if (!old) return { pages: [[optimisticMessage]], pageParams: [null] }
          const pages = [...old.pages]
          pages[pages.length - 1] = [...pages[pages.length - 1], optimisticMessage]
          return { ...old, pages }
        }
      )

      return { previousData }
    },
    onError: (_err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          ['messages', variables.conversationId],
          context.previousData
        )
      }
    },
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}

export function useUpdateMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string; conversationId: string }) => {
      const { error } = await supabase
        .from('messages')
        .update({ content })
        .eq('id', messageId)
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] })
    },
  })
}

export function useDeleteMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ messageId }: { messageId: string; conversationId: string }) => {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId)
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] })
    },
  })
}
