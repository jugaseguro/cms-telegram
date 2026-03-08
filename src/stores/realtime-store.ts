import { create } from 'zustand'

type RealtimeStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

interface RealtimeState {
  status: RealtimeStatus
  lastConnectedAt: Date | null
  setStatus: (status: RealtimeStatus) => void
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  status: 'connecting',
  lastConnectedAt: null,
  setStatus: (status) =>
    set({
      status,
      ...(status === 'connected' ? { lastConnectedAt: new Date() } : {}),
    }),
}))
