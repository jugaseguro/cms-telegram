'use client'

import { memo } from 'react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { useChatStore } from '@/stores/chat-store'
import { CircleDollarSign } from 'lucide-react'
import { WaitingBadge } from './waiting-badge'
import { CONVERSATION_STATUS_COLORS } from '@/lib/constants'
import type { ConversationWithCustomerAndLabels } from '@/lib/supabase/types'

interface ConversationItemProps {
  conversation: ConversationWithCustomerAndLabels
  isActive: boolean
  onClick: () => void
}

export const ConversationItem = memo(function ConversationItem({
  conversation,
  isActive,
  onClick,
}: ConversationItemProps) {
  const isUnread = useChatStore((s) => s.unreadConversationIds.has(conversation.id))
  const customer = conversation.customers
  const name =
    [customer.first_name, customer.last_name].filter(Boolean).join(' ') ||
    customer.telegram_username ||
    `ID: ${customer.telegram_id}`

  const initials = name.slice(0, 2).toUpperCase()

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all duration-200 cursor-pointer',
        isActive
          ? 'bg-primary/10 shadow-sm shadow-primary/5'
          : isUnread
          ? 'bg-emerald-500/8 hover:bg-emerald-500/12'
          : 'hover:bg-accent/60'
      )}
    >
      <div className="relative flex-shrink-0">
        <Avatar className={cn(
          'h-10 w-10 transition-all duration-200',
          isUnread && 'ring-2 ring-emerald-500 ring-offset-1 ring-offset-background',
          isActive && 'ring-2 ring-primary/30 ring-offset-1 ring-offset-background'
        )}>
          <AvatarFallback className={cn(
            'text-xs font-semibold',
            isActive ? 'bg-primary/15 text-primary' : 'bg-muted'
          )}>
            {initials}
          </AvatarFallback>
        </Avatar>
        {isUnread && (
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-background bg-emerald-500" />
        )}
        {customer.has_paid && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background bg-green-500">
            <CircleDollarSign className="h-2.5 w-2.5 text-white" />
          </span>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <p className={cn('truncate text-sm', isUnread ? 'font-bold' : 'font-medium')}>
            {name}
          </p>
          <Badge
            variant="secondary"
            className={cn('text-[10px] px-1.5 py-0 h-5 flex-shrink-0', CONVERSATION_STATUS_COLORS[conversation.status])}
          >
            {conversation.status}
          </Badge>
        </div>
        {conversation.last_message_at && (
          <p className={cn(
            'text-xs mt-0.5',
            isUnread ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
          )} suppressHydrationWarning>
            {formatDistanceToNow(new Date(conversation.last_message_at), {
              addSuffix: true,
              locale: es,
            })}
          </p>
        )}
        {conversation.profiles && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Agente: {conversation.profiles.full_name}
          </p>
        )}
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {conversation.waiting_since && (
            <WaitingBadge waitingSince={conversation.waiting_since} compact />
          )}
          {conversation.conversation_labels?.slice(0, 3).map((cl) => (
            <span
              key={cl.labels.id}
              className="inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium text-white leading-4"
              style={{ backgroundColor: cl.labels.color }}
            >
              {cl.labels.name}
            </span>
          ))}
          {(conversation.conversation_labels?.length ?? 0) > 3 && (
            <span className="text-[10px] text-muted-foreground">
              +{(conversation.conversation_labels?.length ?? 0) - 3}
            </span>
          )}
        </div>
      </div>
    </button>
  )
})
