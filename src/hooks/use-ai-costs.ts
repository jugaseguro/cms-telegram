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
      const { data, error } = await (supabase.rpc as any)('get_ai_costs_summary', selectedBotId ? { p_bot_id: selectedBotId } : {})
      
      if (error) throw error
      const result = data?.[0] || {
        total_cost: 0,
        total_tokens: 0,
        month_cost: 0,
        month_tokens: 0,
        call_count: 0
      }

      return {
        totalCost: Number(result.total_cost || 0),
        totalTokens: Number(result.total_tokens || 0),
        monthCost: Number(result.month_cost || 0),
        monthTokens: Number(result.month_tokens || 0),
        callCount: Number(result.call_count || 0),
        avgCostPerCall: result.call_count > 0 ? Number(result.total_cost) / Number(result.call_count) : 0,
      }
    },
  })
}
