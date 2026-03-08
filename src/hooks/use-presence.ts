import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'

const supabase = createClient()

export interface OnlineAgent {
  agent_id: string
  full_name: string
  avatar_url: string | null
}

export function useAgentPresence() {
  const { user, profile } = useAuthStore()
  const [onlineAgents, setOnlineAgents] = useState<OnlineAgent[]>([])

  useEffect(() => {
    if (!user || !profile) return

    const channel = supabase.channel('agents-presence', {
      config: { presence: { key: user.id } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<OnlineAgent>()
        const agents: OnlineAgent[] = []
        for (const [, presences] of Object.entries(state)) {
          if (presences.length > 0) {
            const p = presences[0]
            agents.push({
              agent_id: p.agent_id,
              full_name: p.full_name,
              avatar_url: p.avatar_url,
            })
          }
        }
        setOnlineAgents(agents)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            agent_id: user.id,
            full_name: profile.full_name,
            avatar_url: profile.avatar_url,
          })
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, profile])

  return onlineAgents
}
