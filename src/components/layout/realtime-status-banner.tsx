'use client'

import { useRealtimeStore } from '@/stores/realtime-store'
import { WifiOff, Loader2 } from 'lucide-react'

export function RealtimeStatusBanner() {
  const status = useRealtimeStore((s) => s.status)

  if (status === 'connected' || status === 'connecting') return null

  return (
    <div className="flex items-center justify-center gap-2 bg-destructive px-4 py-1.5 text-sm text-destructive-foreground">
      {status === 'reconnecting' ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Reconectando al servidor...</span>
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5" />
          <span>Sin conexión en tiempo real. Los mensajes no se actualizarán.</span>
        </>
      )}
    </div>
  )
}
