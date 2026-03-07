'use client'

import { useMemo, useCallback } from 'react'
import { useConversations } from '@/hooks/use-conversations'
import { useRealtimeConversations } from '@/hooks/use-realtime'
import { useChatStore } from '@/stores/chat-store'
import { ConversationItem } from './conversation-item'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, MessageSquareOff } from 'lucide-react'

export function ConversationList() {
  const {
    activeConversationId,
    statusFilter,
    searchQuery,
    setActiveConversation,
    setStatusFilter,
    setSearchQuery,
  } = useChatStore()

  const { data: conversations, isLoading } = useConversations(statusFilter)
  useRealtimeConversations()

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
    <div className="flex h-full flex-col border-r">
      <div className="space-y-2 border-b p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as 'all' | 'open' | 'closed' | 'pending')}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="open">Abiertos</SelectItem>
            <SelectItem value="pending">Pendientes</SelectItem>
            <SelectItem value="closed">Cerrados</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {isLoading && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Cargando...
            </p>
          )}
          {filtered?.length === 0 && !isLoading && (
            <div className="flex flex-col items-center gap-2 p-8 text-muted-foreground">
              <MessageSquareOff className="h-8 w-8" />
              <p className="text-sm">No hay conversaciones</p>
            </div>
          )}
          {filtered?.map((conversation) => (
            <div key={conversation.id} style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 72px' }}>
              <ConversationItem
                conversation={conversation}
                isActive={conversation.id === activeConversationId}
                onClick={() => setActiveConversation(conversation.id)}
              />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
