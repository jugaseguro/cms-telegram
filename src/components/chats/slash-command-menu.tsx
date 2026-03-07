'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { AutoResponse } from '@/lib/supabase/types'

interface SlashCommandMenuProps {
  query: string
  responses: AutoResponse[]
  onSelect: (text: string) => void
  onClose: () => void
}

export function SlashCommandMenu({
  query,
  responses,
  onSelect,
  onClose,
}: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const filtered = responses.filter((r) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      r.shortcut?.toLowerCase().includes(q) ||
      r.trigger_text.toLowerCase().includes(q)
    )
  })

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => (i + 1) % filtered.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex].response_text)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filtered, selectedIndex, onSelect, onClose])

  if (filtered.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 right-0 z-50 mb-1 rounded-lg border bg-popover shadow-lg">
      <ScrollArea className="max-h-56">
        <div className="p-1">
          {filtered.map((r, i) => (
            <button
              key={r.id}
              ref={(el) => { itemRefs.current[i] = el }}
              className={cn(
                'flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors',
                i === selectedIndex ? 'bg-accent' : 'hover:bg-accent/50'
              )}
              onClick={() => onSelect(r.response_text)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="text-xs font-semibold text-primary">
                /{r.shortcut || r.trigger_text}
              </span>
              <span className="line-clamp-1 text-sm text-muted-foreground">
                {r.response_text}
              </span>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
