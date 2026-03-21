import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface FeatureFlagsState {
  chatV2: boolean
  setChatV2: (enabled: boolean) => void
}

export const useFeatureFlags = create<FeatureFlagsState>()(
  persist(
    (set) => ({
      chatV2: false,
      setChatV2: (enabled) => set({ chatV2: enabled }),
    }),
    {
      name: 'feature-flags',
    }
  )
)
