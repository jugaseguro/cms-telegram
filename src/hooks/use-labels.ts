import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { withTimeout } from '@/lib/timeout'
import { useAuthStore } from '@/stores/auth-store'
import type { Label } from '@/lib/supabase/types'
import { toast } from 'sonner'

const MUTATION_TIMEOUT_MS = 12_000

export function useLabels() {
  const isInitialized = useAuthStore((s) => s.isInitialized)

  return useQuery({
    queryKey: ['labels'],
    enabled: isInitialized,
    staleTime: 300_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('labels')
        .select('id, name, color')
        .order('name')
      if (error) throw error
      return data as Label[]
    },
  })
}

export function useConversationLabels(conversationId: string) {
  return useQuery({
    queryKey: ['conversation-labels', conversationId],
    staleTime: 120_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('conversation_labels')
        .select('label_id, labels(id, name, color)')
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
      const supabase = createClient()
      if (isActive) {
        const { error } = await withTimeout(
          supabase
            .from('conversation_labels')
            .delete()
            .eq('conversation_id', conversationId)
            .eq('label_id', labelId),
          MUTATION_TIMEOUT_MS,
          'LABEL_TOGGLE_TIMEOUT'
        )
        if (error) throw error
      } else {
        const { error } = await withTimeout(
          supabase
            .from('conversation_labels')
            .insert({ conversation_id: conversationId, label_id: labelId }),
          MUTATION_TIMEOUT_MS,
          'LABEL_TOGGLE_TIMEOUT'
        )
        if (error) throw error
      }
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: ['conversation-labels', conversationId] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
    onError: (error) => {
      toast.error(
        error.message === 'LABEL_TOGGLE_TIMEOUT'
          ? 'La etiqueta tardó demasiado en guardarse.'
          : `No se pudo guardar la etiqueta: ${error.message}`
      )
    },
  })
}

export function useCreateLabel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { name: string; color: string }) => {
      const supabase = createClient()
      const { error } = await withTimeout(
        supabase.from('labels').insert(data),
        MUTATION_TIMEOUT_MS,
        'LABEL_CREATE_TIMEOUT'
      )
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
      const supabase = createClient()
      const { error } = await withTimeout(
        supabase.from('labels').update(data).eq('id', id),
        MUTATION_TIMEOUT_MS,
        'LABEL_UPDATE_TIMEOUT'
      )
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
      const supabase = createClient()
      const { error } = await withTimeout(
        supabase.from('labels').delete().eq('id', id),
        MUTATION_TIMEOUT_MS,
        'LABEL_DELETE_TIMEOUT'
      )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels'] })
    },
  })
}
