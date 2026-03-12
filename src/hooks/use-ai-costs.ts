import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { AiUsageLogWithDetails } from '@/lib/supabase/types'
import { useBotStore } from '@/stores/bot-store'
import { useAuthStore } from '@/stores/auth-store'

const supabase = createClient()

export function useAiCosts() {
  const { selectedBotId } = useBotStore()
  const { isInitialized } = useAuthStore()

  return useQuery({
    queryKey: ['ai-costs', selectedBotId],
    enabled: isInitialized,
    queryFn: async () => {
      let query = supabase
        .from('ai_usage_logs')
        .select(`
          *,
          conversations(
            customers(first_name, last_name, telegram_username)
          ),
          bots(id, name, color)
        `)
        .order('created_at', { ascending: false })
        .limit(200)

      if (selectedBotId) {
        query = query.eq('bot_id', selectedBotId)
      }

      const { data, error } = await query
      if (error) throw error
      return data as AiUsageLogWithDetails[]
    },
  })
}

export function useAiCostsSummary() {
  const { selectedBotId } = useBotStore()
  const { isInitialized } = useAuthStore()

  return useQuery({
    queryKey: ['ai-costs-summary', selectedBotId],
    enabled: isInitialized,
    queryFn: async () => {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      let queryAll = supabase
        .from('ai_usage_logs')
        .select('cost_usd, total_tokens, created_at')

      let queryMonth = supabase
        .from('ai_usage_logs')
        .select('cost_usd, total_tokens')
        .gte('created_at', startOfMonth)

      if (selectedBotId) {
        queryAll = queryAll.eq('bot_id', selectedBotId)
        queryMonth = queryMonth.eq('bot_id', selectedBotId)
      }

      const [allResult, monthResult] = await Promise.all([queryAll, queryMonth])
      if (allResult.error) throw allResult.error
      if (monthResult.error) throw monthResult.error

      const totalCost = (allResult.data ?? []).reduce((sum, r) => sum + Number(r.cost_usd), 0)
      const totalTokens = (allResult.data ?? []).reduce((sum, r) => sum + r.total_tokens, 0)
      const monthCost = (monthResult.data ?? []).reduce((sum, r) => sum + Number(r.cost_usd), 0)
      const monthTokens = (monthResult.data ?? []).reduce((sum, r) => sum + r.total_tokens, 0)
      const callCount = allResult.data?.length ?? 0

      return {
        totalCost,
        totalTokens,
        monthCost,
        monthTokens,
        callCount,
        avgCostPerCall: callCount > 0 ? totalCost / callCount : 0,
      }
    },
  })
}
