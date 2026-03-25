'use client'

import { useState, useEffect } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { useConversations } from '@/hooks/use-conversations'
import { ConversationList } from '@/components/chats/conversation-list'
import { ChatPanel } from '@/components/chats/chat-panel'
import { CustomerInfoPanel } from '@/components/chats/customer-info-panel'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { MessageSquare } from 'lucide-react'

export function ChatsContent() {
  const { activeConversationId, setActiveConversation } = useChatStore()
  const { data: conversations } = useConversations()
  const [profileOpen, setProfileOpen] = useState(false)

  // Clear active conversation when leaving the chats page to prevent
  // stale WebSocket subscriptions and message queries on other pages
  useEffect(() => {
    return () => {
      setActiveConversation(null)
    }
  }, [setActiveConversation])

  const activeConversation = conversations?.find(
    (c) => c.id === activeConversationId
  )

  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Conversation List */}
      <div className="w-80 flex-shrink-0">
        <ConversationList />
      </div>

      {/* Chat Panel */}
      <div className="flex min-w-0 flex-1">
        {activeConversation ? (
          <div className="flex min-w-0 flex-1 flex-col">
            <ChatPanel
              key={activeConversation.id}
              conversation={activeConversation}
              onToggleProfile={() => setProfileOpen(true)}
            />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground animate-fade-in">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/8 mb-5">
              <MessageSquare className="h-10 w-10 text-primary/40" />
            </div>
            <p className="text-lg font-semibold text-foreground/70">
              Selecciona una conversación
            </p>
            <p className="text-sm mt-1">
              Elige un chat de la lista para comenzar
            </p>
          </div>
        )}
      </div>

      {/* Customer Profile Sheet (right to left) */}
      {activeConversation && (
        <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
          <SheetContent side="right" className="w-80 overflow-y-auto p-0 sm:max-w-80">
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle>Perfil del cliente</SheetTitle>
            </SheetHeader>
            <CustomerInfoPanel customer={activeConversation.customers} />
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
