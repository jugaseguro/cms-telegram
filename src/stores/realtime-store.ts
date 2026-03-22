import { create } from 'zustand'
import type { AppSocket } from '@/lib/socket'

type RealtimeStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

interface RealtimeState {
  status: RealtimeStatus
  lastConnectedAt: Date | null
  socket: AppSocket | null
  setStatus: (status: RealtimeStatus) => void
  setSocket: (socket: AppSocket | null) => void
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  status: 'connecting',
  lastConnectedAt: null,
  socket: null,
  setStatus: (status) =>
    set({
      status,
      ...(status === 'connected' ? { lastConnectedAt: new Date() } : {}),
    }),
  setSocket: (socket) => set({ socket }),
}))
