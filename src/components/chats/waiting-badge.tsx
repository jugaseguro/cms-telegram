'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Clock } from 'lucide-react'

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
  return mins > 0 ? `${hours}h${mins}m` : `${hours}h`
}

type Urgency = 'low' | 'medium' | 'high'

function getUrgency(minutes: number): Urgency {
  if (minutes >= 10) return 'high'
  if (minutes >= 5) return 'medium'
  return 'low'
}

const urgencyStyles: Record<Urgency, { pill: string; icon: string }> = {
  low: {
    pill: 'bg-muted/60 text-muted-foreground',
    icon: 'text-muted-foreground/70',
  },
  medium: {
    pill: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    icon: 'text-amber-500 dark:text-amber-400',
  },
  high: {
    pill: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    icon: 'text-rose-500 dark:text-rose-400',
  },
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

  const urgency = getUrgency(minutes)
  const styles = urgencyStyles[urgency]

  if (compact) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded-md px-1 py-px text-[10px] font-medium leading-4 tabular-nums',
          styles.pill
        )}
        title={`Esperando hace ${formatWaiting(minutes)}`}
        suppressHydrationWarning
      >
        <Clock className={cn('h-2.5 w-2.5', styles.icon)} />
        {formatWaiting(minutes)}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums',
        styles.pill,
        urgency === 'high' && 'animate-pulse'
      )}
      suppressHydrationWarning
    >
      <Clock className={cn('h-3 w-3', styles.icon)} />
      Esperando {formatWaiting(minutes)}
    </span>
  )
}
