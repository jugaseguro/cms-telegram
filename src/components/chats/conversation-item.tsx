'use client'

import { memo } from 'react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { useChatStore } from '@/stores/chat-store'
import { CircleDollarSign, User, Clock, Headset } from 'lucide-react'
import { WaitingBadge } from './waiting-badge'
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
  const bot = conversation.bots
  const isRequestingAgent = conversation.status === 'waiting_agent'
  const isPendingDeposit = conversation.status === 'pending'
  const isWaitingAgent = !isPendingDeposit && !isRequestingAgent && !!conversation.waiting_since
  const name =
    [customer.first_name, customer.last_name].filter(Boolean).join(' ') ||
    customer.telegram_username ||
    `ID: ${customer.telegram_id}`

  const initials = name.slice(0, 2).toUpperCase()

  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex w-full gap-3 rounded-xl p-3 text-left transition-all duration-200 cursor-pointer',
        isActive
          ? 'bg-primary/10 shadow-sm shadow-primary/5 ring-1 ring-primary/15'
          : isRequestingAgent
          ? 'bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-300 dark:ring-blue-700/60 hover:bg-blue-100 dark:hover:bg-blue-900/40'
          : isPendingDeposit
          ? 'bg-red-100 dark:bg-red-950/60 ring-1 ring-red-300 dark:ring-red-800 animate-pulse hover:bg-red-200 dark:hover:bg-red-900/60'
          : isWaitingAgent
          ? 'bg-yellow-50 dark:bg-yellow-950/40 ring-1 ring-yellow-300 dark:ring-yellow-700/60 hover:bg-yellow-100 dark:hover:bg-yellow-900/40'
          : isUnread
          ? 'bg-emerald-500/6 hover:bg-emerald-500/10'
          : 'hover:bg-accent/50'
      )}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0 mt-0.5">
        <Avatar className={cn(
          'h-11 w-11 transition-all duration-200',
          isUnread && 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-background',
          isActive && 'ring-2 ring-primary/40 ring-offset-2 ring-offset-background',
          isRequestingAgent && 'ring-2 ring-blue-400 ring-offset-2 ring-offset-background',
          isPendingDeposit && 'ring-2 ring-red-400 ring-offset-2 ring-offset-background',
          isWaitingAgent && 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-background',
        )}>
          <AvatarFallback className={cn(
            'text-xs font-bold',
            isActive
              ? 'bg-primary/15 text-primary'
              : isRequestingAgent
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
              : isPendingDeposit
              ? 'bg-red-200 text-red-700 dark:bg-red-900/50 dark:text-red-300'
              : isWaitingAgent
              ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300'
              : isUnread
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'bg-muted text-muted-foreground'
          )}>
            {initials}
          </AvatarFallback>
        </Avatar>
        {isRequestingAgent && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border-2 border-background bg-blue-500 shadow-sm">
            <Headset className="h-2.5 w-2.5 text-white" />
          </span>
        )}
        {isPendingDeposit && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border-2 border-background bg-red-500 shadow-sm">
            <CircleDollarSign className="h-2.5 w-2.5 text-white" />
          </span>
        )}
        {isWaitingAgent && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border-2 border-background bg-yellow-400 shadow-sm">
            <Clock className="h-2.5 w-2.5 text-white" />
          </span>
        )}
        {!isRequestingAgent && !isPendingDeposit && !isWaitingAgent && isUnread && !customer.has_paid && (
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-background bg-emerald-500" />
        )}
        {customer.has_paid && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border-2 border-background bg-green-500 shadow-sm">
            <CircleDollarSign className="h-2.5 w-2.5 text-white" />
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Row 1: Name + Time */}
        <div className="flex items-center justify-between gap-2">
          <p className={cn(
            'truncate text-[13px] leading-tight',
            isUnread ? 'font-bold text-foreground' : 'font-semibold text-foreground/90'
          )}>
            {name}
          </p>
          {conversation.last_message_at && (
            <span className={cn(
              'flex-shrink-0 text-[11px] tabular-nums',
              isUnread ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
            )} suppressHydrationWarning>
              {formatDistanceToNow(new Date(conversation.last_message_at), {
                addSuffix: false,
                locale: es,
              })}
            </span>
          )}
        </div>

        {/* Row 2: Bot + Agent */}
        {(bot || conversation.profiles) && (
          <div className="flex items-center gap-1.5 text-[11px] leading-none">
            {bot && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <span
                  className="h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: bot.color }}
                />
                <span className="truncate max-w-[70px]">{bot.name}</span>
              </span>
            )}

            {bot && conversation.profiles && (
              <span className="text-muted-foreground/40">|</span>
            )}

            {conversation.profiles && (
              <span className="inline-flex items-center gap-1 text-muted-foreground truncate">
                <User className="h-3 w-3 flex-shrink-0 opacity-60" />
                <span className="truncate">{conversation.profiles.full_name}</span>
              </span>
            )}
          </div>
        )}

        {/* Row 3: Labels + Waiting (only if present) */}
        {((conversation.conversation_labels?.length ?? 0) > 0 || conversation.waiting_since) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {conversation.waiting_since && (
              <WaitingBadge waitingSince={conversation.waiting_since} compact />
            )}
            {conversation.conversation_labels?.slice(0, 3).map((cl) => (
              <span
                key={cl.labels.id}
                className="inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium text-white leading-4"
                style={{ backgroundColor: cl.labels.color }}
              >
                {cl.labels.name}
              </span>
            ))}
            {(conversation.conversation_labels?.length ?? 0) > 3 && (
              <span className="text-[10px] text-muted-foreground font-medium">
                +{(conversation.conversation_labels?.length ?? 0) - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  )
})
