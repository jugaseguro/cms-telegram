'use client'

import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface WaitingBadgeProps {
  waitingSince: string
  compact?: boolean
}

function getMinutesDiff(since: string): number {
  return Math.floor((Date.now() - new Date(since).getTime()) / 60000)
}

function formatWaiting(minutes: number): string {
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

export function WaitingBadge({ waitingSince, compact }: WaitingBadgeProps) {
  const [minutes, setMinutes] = useState(() => getMinutesDiff(waitingSince))

  useEffect(() => {
    setMinutes(getMinutesDiff(waitingSince))
    const interval = setInterval(() => {
      setMinutes(getMinutesDiff(waitingSince))
    }, 30000)
    return () => clearInterval(interval)
  }, [waitingSince])

  const color =
    minutes >= 10
      ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
      : minutes >= 5
        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400'
        : 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'

  if (compact) {
    return (
      <span
        className={cn(
          'inline-block h-2.5 w-2.5 rounded-full',
          minutes >= 10 ? 'bg-red-500 animate-pulse' : minutes >= 5 ? 'bg-yellow-500' : 'bg-green-500'
        )}
        title={`Esperando hace ${formatWaiting(minutes)}`}
      />
    )
  }

  return (
    <Badge
      variant="secondary"
      className={cn('text-xs', color, minutes >= 10 && 'animate-pulse')}
      suppressHydrationWarning
    >
      Esperando {formatWaiting(minutes)}
    </Badge>
  )
}
