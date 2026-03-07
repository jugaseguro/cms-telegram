'use client'

import { useLabels, useConversationLabels, useToggleConversationLabel } from '@/hooks/use-labels'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Tag } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LabelPickerProps {
  conversationId: string
}

export function LabelPicker({ conversationId }: LabelPickerProps) {
  const { data: allLabels } = useLabels()
  const { data: conversationLabels } = useConversationLabels(conversationId)
  const toggleLabel = useToggleConversationLabel()

  const activeLabelIds = new Set(conversationLabels?.map((cl) => cl.label_id) ?? [])

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            <Tag className="mr-1 h-4 w-4" />
            Etiquetas
          </Button>
        }
      />
      <PopoverContent side="bottom" align="start" className="w-56 p-1">
        {allLabels?.map((label) => {
          const isActive = activeLabelIds.has(label.id)
          return (
            <button
              key={label.id}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent',
                isActive && 'bg-accent/50'
              )}
              onClick={() =>
                toggleLabel.mutate({
                  conversationId,
                  labelId: label.id,
                  isActive,
                })
              }
            >
              <span
                className="h-3 w-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: label.color }}
              />
              <span className="flex-1 text-left">{label.name}</span>
              {isActive && (
                <span className="text-xs text-primary font-medium">&#10003;</span>
              )}
            </button>
          )
        })}
        {(!allLabels || allLabels.length === 0) && (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">
            No hay etiquetas configuradas
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
