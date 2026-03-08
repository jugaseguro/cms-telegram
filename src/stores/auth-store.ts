import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/supabase/types'

interface AuthState {
  user: User | null
  profile: Profile | null
  isInitialized: boolean
  setUser: (user: User | null) => void
  setProfile: (profile: Profile | null) => void
  setInitialized: (value: boolean) => void
  isAdmin: () => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  isInitialized: false,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setInitialized: (value) => set({ isInitialized: value }),
  isAdmin: () => get().profile?.role === 'admin',
}))
