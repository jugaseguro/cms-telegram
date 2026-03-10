import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { SegmentationRule, SegmentationRuleWithLabel, SegmentationLog, SegmentationCondition } from '@/lib/supabase/types'

const supabase = createClient()

export function useSegmentationRules() {
  return useQuery({
    queryKey: ['segmentation-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('segmentation_rules')
        .select('*, labels(*)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as SegmentationRuleWithLabel[]
    },
  })
}

export function useSegmentationLogs() {
  return useQuery({
    queryKey: ['segmentation-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('segmentation_logs')
        .select('*, customers(first_name, last_name, telegram_username), segmentation_rules(name), labels(name, color)')
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data as (SegmentationLog & {
        customers: { first_name: string | null; last_name: string | null; telegram_username: string | null }
        segmentation_rules: { name: string }
        labels: { name: string; color: string }
      })[]
    },
  })
}

export function useCreateSegmentationRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      name: string
      description: string | null
      label_id: string
      conditions: SegmentationCondition[]
      auto_remove: boolean
      bot_id: string | null
    }) => {
      const { error } = await supabase.from('segmentation_rules').insert(data)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['segmentation-rules'] })
    },
  })
}

export function useUpdateSegmentationRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...data }: {
      id: string
      name: string
      description: string | null
      label_id: string
      conditions: SegmentationCondition[]
      auto_remove: boolean
      bot_id: string | null
    }) => {
      const { error } = await supabase
        .from('segmentation_rules')
        .update(data)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['segmentation-rules'] })
    },
  })
}

export function useDeleteSegmentationRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('segmentation_rules')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['segmentation-rules'] })
    },
  })
}

export function useToggleSegmentationRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('segmentation_rules')
        .update({ is_active })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['segmentation-rules'] })
    },
  })
}
