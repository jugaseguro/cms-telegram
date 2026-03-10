import { create } from 'zustand'
import type { BotPublic } from '@/lib/supabase/types'

interface BotState {
  bots: BotPublic[]
  selectedBotId: string | null // null = "Todos los bots"
  setBots: (bots: BotPublic[]) => void
  selectBot: (id: string | null) => void
}

// Restore from localStorage if available
function getInitialBotId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem('selectedBotId') || null
  } catch {
    return null
  }
}

export const useBotStore = create<BotState>((set) => ({
  bots: [],
  selectedBotId: getInitialBotId(),
  setBots: (bots) => set({ bots }),
  selectBot: (id) => {
    try {
      if (id) {
        localStorage.setItem('selectedBotId', id)
      } else {
        localStorage.removeItem('selectedBotId')
      }
    } catch {
      // SSR or storage unavailable
    }
    set({ selectedBotId: id })
  },
}))
