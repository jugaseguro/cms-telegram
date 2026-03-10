'use client'

import { useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useConversations } from '@/hooks/use-conversations'
import { useChatStore } from '@/stores/chat-store'
import { ConversationItem } from './conversation-item'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Search, MessageSquareOff } from 'lucide-react'

export function ConversationList() {
  const {
    activeConversationId,
    searchQuery,
    setActiveConversation,
    setSearchQuery,
  } = useChatStore()

  const queryClient = useQueryClient()
  const { data: conversations, isLoading } = useConversations()
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value),
    [setSearchQuery]
  )

  const filtered = useMemo(() => conversations?.filter((c) => {
    if (!searchQuery) return true
    const customer = c.customers
    const name =
      [customer.first_name, customer.last_name].filter(Boolean).join(' ') +
      (customer.telegram_username || '')
    return name.toLowerCase().includes(searchQuery.toLowerCase())
  }), [conversations, searchQuery])

  return (
    <div className="flex h-full flex-col border-r bg-card/40">
      <div className="border-b p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar conversación..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="pl-9 bg-muted/50 border-transparent focus:border-primary/30 focus:bg-background transition-all duration-200"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {isLoading && (
            <div className="flex flex-col gap-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="h-10 w-10 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 rounded bg-muted" />
                    <div className="h-2.5 w-16 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {filtered?.length === 0 && !isLoading && (
            <div className="flex flex-col items-center gap-3 p-8 text-muted-foreground">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60">
                <MessageSquareOff className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium">No hay conversaciones</p>
            </div>
          )}
          {filtered?.map((conversation) => (
            <div key={conversation.id} style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 76px' }}>
              <ConversationItem
                conversation={conversation}
                isActive={conversation.id === activeConversationId}
                onClick={() => {
                  setActiveConversation(conversation.id)
                  queryClient.invalidateQueries({
                    queryKey: ['messages', conversation.id],
                  })
                }}
              />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
