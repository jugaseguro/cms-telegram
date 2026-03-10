'use client'

import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useMessages } from '@/hooks/use-messages'
import { useRealtimeMessages } from '@/hooks/use-realtime'
import { MessageBubble } from './message-bubble'
import { MessageInput } from './message-input'
import { Button } from '@/components/ui/button'
import { Loader2, User, CircleDollarSign, ArrowDown } from 'lucide-react'
import { LabelPicker } from './label-picker'
import { WaitingBadge } from './waiting-badge'
import { useConversationLabels } from '@/hooks/use-labels'
import type { ConversationWithCustomerAndLabels } from '@/lib/supabase/types'

const VIRTUALIZATION_THRESHOLD = 200

interface ChatPanelProps {
  conversation: ConversationWithCustomerAndLabels
  onToggleProfile?: () => void
}

export function ChatPanel({ conversation, onToggleProfile }: ChatPanelProps) {
  const {
    data: messages,
    isLoading,
    isFetching,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useMessages(conversation.id)
  useRealtimeMessages(conversation.id)
  const { data: conversationLabels } = useConversationLabels(conversation.id)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isInitialLoad = useRef(true)
  const prevMessageCount = useRef(0)
  const [newMsgCount, setNewMsgCount] = useState(0)

  const useVirtual = messages.length > VIRTUALIZATION_THRESHOLD

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 72,
    overscan: 15,
    enabled: useVirtual,
  })

  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 150
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (useVirtual) {
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' })
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior })
    }
  }, [useVirtual, virtualizer, messages.length])

  const handleLoadOlder = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const prevScrollHeight = el.scrollHeight
    fetchNextPage().then(() => {
      requestAnimationFrame(() => {
        const newScrollHeight = el.scrollHeight
        el.scrollTop += newScrollHeight - prevScrollHeight
      })
    })
  }, [fetchNextPage])

  const handleScroll = useCallback(() => {
    if (isNearBottom()) {
      setNewMsgCount(0)
    }
  }, [isNearBottom])

  // Scroll on messages change
  useEffect(() => {
    if (!messages?.length) return

    if (isInitialLoad.current) {
      isInitialLoad.current = false
      requestAnimationFrame(() => scrollToBottom('instant'))
      prevMessageCount.current = messages.length
      return
    }

    // New messages arrived
    if (messages.length > prevMessageCount.current) {
      const newCount = messages.length - prevMessageCount.current
      const lastMsg = messages[messages.length - 1]
      const isOwnMessage = lastMsg.sender_type === 'agent'

      if (isOwnMessage || isNearBottom()) {
        scrollToBottom('smooth')
        setNewMsgCount(0)
      } else {
        setNewMsgCount((prev) => prev + newCount)
      }
    }

    prevMessageCount.current = messages.length
  }, [messages, scrollToBottom, isNearBottom])

  // Reset on conversation change
  useEffect(() => {
    isInitialLoad.current = true
    prevMessageCount.current = 0
    setNewMsgCount(0)
  }, [conversation.id])

  const customerName =
    [conversation.customers.first_name, conversation.customers.last_name]
      .filter(Boolean)
      .join(' ') ||
    conversation.customers.telegram_username ||
    `ID: ${conversation.customers.telegram_id}`

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Chat Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b bg-card/60 backdrop-blur-sm px-5 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 font-semibold text-[15px]">
            {customerName}
            {conversation.customers.has_paid && (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-500 shadow-sm shadow-green-500/20" title="Cliente con carga confirmada">
                <CircleDollarSign className="h-3 w-3 text-white" />
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            {conversation.waiting_since && (
              <WaitingBadge waitingSince={conversation.waiting_since} />
            )}
            {conversation.bots && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: conversation.bots.color }}
                />
                via {conversation.bots.name}
              </span>
            )}
            {conversation.profiles && (
              <span className="text-[11px] text-muted-foreground">
                Asignado a: <span className="font-medium text-foreground/70">{conversation.profiles.full_name}</span>
              </span>
            )}
            {conversationLabels?.map((cl) => (
              <span
                key={cl.label_id}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-white shadow-sm"
                style={{ backgroundColor: cl.labels.color }}
              >
                {cl.labels.name}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
          <LabelPicker conversationId={conversation.id} />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={onToggleProfile}
            title="Ver perfil del cliente"
          >
            <User className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages - scrollable area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="chat-bg relative min-h-0 flex-1 overflow-y-auto p-4"
      >
        {hasNextPage && (
          <div className="flex justify-center pb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLoadOlder}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : null}
              Cargar anteriores
            </Button>
          </div>
        )}
        {isFetching && !messages?.length && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {useVirtual ? (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={messages[virtualRow.index].id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="py-1.5">
                  <MessageBubble message={messages[virtualRow.index]} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {messages?.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* New messages badge */}
        {newMsgCount > 0 && (
          <button
            onClick={() => {
              scrollToBottom('smooth')
              setNewMsgCount(0)
            }}
            className="sticky bottom-2 left-1/2 z-10 mx-auto flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm text-primary-foreground shadow-lg cursor-pointer"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            {newMsgCount} mensaje{newMsgCount > 1 ? 's' : ''} nuevo{newMsgCount > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Input - fixed at bottom */}
      {conversation.status !== 'closed' && (
        <MessageInput conversationId={conversation.id} />
      )}
    </div>
  )
}
