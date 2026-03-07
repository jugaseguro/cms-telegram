'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Zap, Search } from 'lucide-react'
import type { AutoResponse } from '@/lib/supabase/types'

const supabase = createClient()

interface QuickRepliesPopoverProps {
  onSelect: (text: string) => void
}

export function QuickRepliesPopover({ onSelect }: QuickRepliesPopoverProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const { data: responses } = useQuery({
    queryKey: ['auto-responses-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('auto_responses')
        .select('id, trigger_text, response_text')
        .eq('is_active', true)
        .order('trigger_text')
      if (error) throw error
      return data as AutoResponse[]
    },
    enabled: open,
  })

  const filtered = useMemo(() => responses?.filter((r) => {
    if (!search) return true
    const text = `${r.trigger_text} ${r.response_text}`.toLowerCase()
    return text.includes(search.toLowerCase())
  }), [responses, search])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" title="Respuestas rápidas">
            <Zap className="h-5 w-5" />
          </Button>
        }
      />
      <PopoverContent
        side="top"
        align="start"
        className="w-80 p-0"
      >
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar respuesta..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>
        <ScrollArea className="max-h-64">
          <div className="p-1">
            {filtered?.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                No hay respuestas disponibles
              </p>
            )}
            {filtered?.map((r) => (
              <button
                key={r.id}
                className="flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent"
                onClick={() => {
                  onSelect(r.response_text)
                  setOpen(false)
                  setSearch('')
                }}
              >
                <span className="text-xs font-medium text-primary">
                  {r.trigger_text}
                </span>
                <span className="line-clamp-2 text-sm text-muted-foreground">
                  {r.response_text}
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
