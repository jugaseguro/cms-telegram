'use client'

import { useMemo, useCallback, useRef, useLayoutEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useConversations } from '@/hooks/use-conversations'
import { useChatStore } from '@/stores/chat-store'
import { ConversationItem } from './conversation-item'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Search, MessageSquareOff, Bot, Headset } from 'lucide-react'
import { QueryError } from '@/components/ui/query-error'

const CONVERSATION_ITEM_STYLE = { contentVisibility: 'auto', containIntrinsicSize: 'auto 76px' } as const

export function ConversationList() {
  const {
    activeConversationId,
    searchQuery,
    tabFilter,
    unreadConversationIds,
    setActiveConversation,
    setSearchQuery,
    setTabFilter,
  } = useChatStore()

  const queryClient = useQueryClient()
  const { data: conversations, isLoading, isError, refetch } = useConversations()
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value),
    [setSearchQuery]
  )

  // ─── Preserve scroll position across list updates ───────────────────
  // When `conversations` updates (new messages, re-ordering), React re-renders
  // the list. Without this, the ScrollArea viewport resets its scrollTop to 0
  // or jumps, making the UI feel unstable.
  //
  // Strategy: capture scrollTop synchronously BEFORE the paint (useLayoutEffect
  // runs after DOM mutations but before the browser paints), find the inner
  // Radix ScrollArea viewport element, and restore the position so the user
  // never sees a jump.
  const scrollRef = useRef<HTMLDivElement>(null)
  const savedScrollTop = useRef<number>(0)

  // Save scroll position before the list content changes
  const conversationIds = conversations?.map((c) => c.id).join(',') ?? ''
  const prevConversationIds = useRef(conversationIds)

  useLayoutEffect(() => {
    if (!scrollRef.current) return

    // Find the Radix ScrollArea viewport (the actual scrollable element)
    const viewport = scrollRef.current.querySelector<HTMLElement>(
      '[data-radix-scroll-area-viewport]'
    )
    if (!viewport) return

    if (prevConversationIds.current !== conversationIds) {
      // List changed — restore the saved scroll position
      viewport.scrollTop = savedScrollTop.current
      prevConversationIds.current = conversationIds
    }

    // Always keep the saved position in sync with current scroll
    const onScroll = () => {
      savedScrollTop.current = viewport.scrollTop
    }
    viewport.addEventListener('scroll', onScroll, { passive: true })
    return () => viewport.removeEventListener('scroll', onScroll)
  }, [conversationIds])
  // ─────────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => conversations?.filter((c) => {
    // Tab filter
    const belongsToAgent = c.assigned_agent_id !== null || c.status === 'waiting_agent'
    if (tabFilter === 'agent' && !belongsToAgent) return false
    if (tabFilter === 'bot' && belongsToAgent) return false

    // Search filter
    if (!searchQuery) return true
    const customer = c.customers
    const name =
      [customer.first_name, customer.last_name].filter(Boolean).join(' ') +
      (customer.telegram_username || '')
    return name.toLowerCase().includes(searchQuery.toLowerCase())
  }), [conversations, searchQuery, tabFilter])

  const tabCounts = useMemo(() => {
    if (!conversations) return { bot: 0, agent: 0 }
    let bot = 0, agent = 0
    for (const c of conversations) {
      if (!unreadConversationIds.has(c.id)) continue
      const isAgent = c.assigned_agent_id !== null || c.status === 'waiting_agent'
      if (isAgent) agent++
      else bot++
    }
    return { bot, agent }
  }, [conversations, unreadConversationIds])

  return (
    <div className="flex h-full flex-col border-r bg-card/40">
      <div className="border-b p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar conversación..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="pl-9 bg-muted/50 border-transparent focus:border-primary/30 focus:bg-background transition-all duration-200"
          />
        </div>
        <Tabs
          value={tabFilter}
          onValueChange={(val) => setTabFilter(val as 'bot' | 'agent')}
        >
          <TabsList className="w-full">
            <TabsTrigger value="bot" className="flex-1 gap-1.5">
              <Bot className="h-3.5 w-3.5" />
              Bot
              {tabCounts.bot > 0 && (
                <span className="ml-0.5 rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white leading-4">
                  {tabCounts.bot}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="agent" className="flex-1 gap-1.5">
              <Headset className="h-3.5 w-3.5" />
              Agente
              {tabCounts.agent > 0 && (
                <span className="ml-0.5 rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white leading-4">
                  {tabCounts.agent}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full [&_[data-radix-scroll-area-viewport]]:overscroll-contain">
          <div className="divide-y divide-border/40 p-2">
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
            {isError && (
              <QueryError onRetry={refetch} />
            )}
            {filtered?.length === 0 && !isLoading && !isError && (
              <div className="flex flex-col items-center gap-3 p-8 text-muted-foreground">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60">
                  <MessageSquareOff className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium">No hay conversaciones</p>
              </div>
            )}
            {filtered?.map((conversation) => (
              <div key={conversation.id} className="py-0.5" style={CONVERSATION_ITEM_STYLE}>
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
    </div>
  )
}
