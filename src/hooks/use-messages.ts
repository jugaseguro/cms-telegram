import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Message } from '@/lib/supabase/types'

const supabase = createClient()

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return []
      const { data, error } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_type, sender_id, content, message_type, media_url, telegram_message_id, is_internal, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as Message[]
    },
    enabled: !!conversationId,
  })
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

      // Get customer telegram_id to forward message
      const { data: conv } = await supabase
        .from('conversations')
        .select('customer_id, customers(telegram_id)')
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
          }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          console.error('Telegram send failed:', err)
        }
      }

      return message
    },
    onMutate: async (variables) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({
        queryKey: ['messages', variables.conversationId],
      })

      const previousMessages = queryClient.getQueryData<Message[]>([
        'messages',
        variables.conversationId,
      ])

      // Optimistically add the message
      const optimisticMessage: Message = {
        id: `optimistic-${Date.now()}`,
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

      queryClient.setQueryData<Message[]>(
        ['messages', variables.conversationId],
        (old) => [...(old || []), optimisticMessage]
      )

      return { previousMessages }
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousMessages) {
        queryClient.setQueryData(
          ['messages', variables.conversationId],
          context.previousMessages
        )
      }
    },
    onSettled: (_, __, variables) => {
      // Refetch to get the real data from server
      queryClient.invalidateQueries({
        queryKey: ['messages', variables.conversationId],
      })
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
