import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import type { Label } from '@/lib/supabase/types'

const supabase = createClient()

export function useLabels() {
  const isInitialized = useAuthStore((s) => s.isInitialized)

  return useQuery({
    queryKey: ['labels'],
    enabled: isInitialized,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('labels')
        .select('*')
        .order('name')
      if (error) throw error
      return data as Label[]
    },
  })
}

export function useConversationLabels(conversationId: string) {
  return useQuery({
    queryKey: ['conversation-labels', conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversation_labels')
        .select('label_id, labels(*)')
        .eq('conversation_id', conversationId)
      if (error) throw error
      return data as { label_id: string; labels: Label }[]
    },
  })
}

export function useToggleConversationLabel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      conversationId,
      labelId,
      isActive,
    }: {
      conversationId: string
      labelId: string
      isActive: boolean
    }) => {
      if (isActive) {
        const { error } = await supabase
          .from('conversation_labels')
          .delete()
          .eq('conversation_id', conversationId)
          .eq('label_id', labelId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('conversation_labels')
          .insert({ conversation_id: conversationId, label_id: labelId })
        if (error) throw error
      }
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: ['conversation-labels', conversationId] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}

export function useCreateLabel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { name: string; color: string }) => {
      const { error } = await supabase.from('labels').insert(data)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels'] })
    },
  })
}

export function useUpdateLabel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name: string; color: string }) => {
      const { error } = await supabase.from('labels').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels'] })
    },
  })
}

export function useDeleteLabel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('labels').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels'] })
    },
  })
}
