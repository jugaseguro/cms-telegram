import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { useBotStore } from '@/stores/bot-store'
import { useEffect } from 'react'
import type { BotPublic } from '@/lib/supabase/types'

const supabase = createClient()

export function useBots() {
  const isInitialized = useAuthStore((s) => s.isInitialized)
  const setBots = useBotStore((s) => s.setBots)

  const query = useQuery({
    queryKey: ['bots'],
    enabled: isInitialized,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bots')
        .select('id, name, telegram_username, is_active, color, created_at')
        .eq('is_active', true)
        .order('created_at')

      if (error) {
        console.warn('[use-bots] Error fetching bots:', error.message)
        return [] as BotPublic[]
      }
      return data as BotPublic[]
    },
    staleTime: 60_000,
    retry: 1,
  })

  useEffect(() => {
    if (query.data) {
      setBots(query.data)
      // If the stored selectedBotId no longer matches an active bot, reset to "all bots"
      const currentBotId = useBotStore.getState().selectedBotId
      if (currentBotId && !query.data.some((b) => b.id === currentBotId)) {
        useBotStore.getState().selectBot(null)
      }
    }
  }, [query.data, setBots])

  return query
}
