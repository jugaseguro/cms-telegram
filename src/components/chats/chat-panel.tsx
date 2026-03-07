'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useMessages } from '@/hooks/use-messages'
import { useRealtimeMessages } from '@/hooks/use-realtime'
import { useAuthStore } from '@/stores/auth-store'
import {
  useAssignConversation,
  useUpdateConversationStatus,
} from '@/hooks/use-conversations'
import { MessageBubble } from './message-bubble'
import { MessageInput } from './message-input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UserPlus, XCircle, Loader2, User, CircleDollarSign } from 'lucide-react'
import { LabelPicker } from './label-picker'
import { WaitingBadge } from './waiting-badge'
import { useConversationLabels } from '@/hooks/use-labels'
import type { ConversationWithCustomerAndLabels } from '@/lib/supabase/types'

interface ChatPanelProps {
  conversation: ConversationWithCustomerAndLabels
  onToggleProfile?: () => void
}

export function ChatPanel({ conversation, onToggleProfile }: ChatPanelProps) {
  const { data: messages, isLoading } = useMessages(conversation.id)
  useRealtimeMessages(conversation.id)
  const { user } = useAuthStore()
  const { data: conversationLabels } = useConversationLabels(conversation.id)
  const assignMutation = useAssignConversation()
  const statusMutation = useUpdateConversationStatus()

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isInitialLoad = useRef(true)
  const prevMessageCount = useRef(0)

  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 150
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior })
  }, [])

  // Scroll on messages change
  useEffect(() => {
    if (!messages?.length) return

    if (isInitialLoad.current) {
      // First load: instant scroll, no animation
      isInitialLoad.current = false
      // Use requestAnimationFrame to ensure DOM is painted
      requestAnimationFrame(() => scrollToBottom('instant'))
      prevMessageCount.current = messages.length
      return
    }

    // New messages arrived
    if (messages.length > prevMessageCount.current) {
      const lastMsg = messages[messages.length - 1]
      const isOwnMessage = lastMsg.sender_type === 'agent'

      // Always scroll for own messages, otherwise only if near bottom
      if (isOwnMessage || isNearBottom()) {
        scrollToBottom('smooth')
      }
    }

    prevMessageCount.current = messages.length
  }, [messages, scrollToBottom, isNearBottom])

  const customerName =
    [conversation.customers.first_name, conversation.customers.last_name]
      .filter(Boolean)
      .join(' ') ||
    conversation.customers.telegram_username ||
    `ID: ${conversation.customers.telegram_id}`

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Chat Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="flex items-center gap-1.5 font-semibold">
            {customerName}
            {conversation.customers.has_paid && (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-500" title="Cliente con carga confirmada">
                <CircleDollarSign className="h-3 w-3 text-white" />
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{conversation.status}</Badge>
            {conversation.waiting_since && (
              <WaitingBadge waitingSince={conversation.waiting_since} />
            )}
            {conversation.profiles && (
              <span className="text-xs text-muted-foreground">
                Asignado a: {conversation.profiles.full_name}
              </span>
            )}
            {conversationLabels?.map((cl) => (
              <span
                key={cl.label_id}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                style={{ backgroundColor: cl.labels.color }}
              >
                {cl.labels.name}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <LabelPicker conversationId={conversation.id} />
          {!conversation.assigned_agent_id && user && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                assignMutation.mutate({
                  conversationId: conversation.id,
                  agentId: user.id,
                })
              }
              disabled={assignMutation.isPending}
            >
              <UserPlus className="mr-1 h-4 w-4" />
              Agendar
            </Button>
          )}
          {conversation.status === 'open' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                statusMutation.mutate({
                  conversationId: conversation.id,
                  status: 'closed',
                })
              }
              disabled={statusMutation.isPending}
            >
              <XCircle className="mr-1 h-4 w-4" />
              Cerrar
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleProfile}
            title="Ver perfil del cliente"
          >
            <User className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages - scrollable area */}
      <div ref={scrollContainerRef} className="chat-bg min-h-0 flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {messages?.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input - fixed at bottom */}
      {conversation.status !== 'closed' && (
        <MessageInput conversationId={conversation.id} />
      )}
    </div>
  )
}
