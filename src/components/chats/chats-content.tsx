'use client'

import { useState } from 'react'
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
  const { activeConversationId, statusFilter } = useChatStore()
  const { data: conversations } = useConversations(statusFilter)
  const [profileOpen, setProfileOpen] = useState(false)

  const activeConversation = conversations?.find(
    (c) => c.id === activeConversationId
  )

  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)]">
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
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
            <MessageSquare className="mb-4 h-12 w-12" />
            <p className="text-lg font-medium">
              Selecciona una conversación
            </p>
            <p className="text-sm">
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
