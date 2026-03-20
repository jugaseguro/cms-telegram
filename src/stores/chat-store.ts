import { create } from 'zustand'

interface ChatState {
  activeConversationId: string | null
  searchQuery: string
  tabFilter: 'bot' | 'agent'
  unreadConversationIds: Set<string>
  setActiveConversation: (id: string | null) => void
  setSearchQuery: (query: string) => void
  setTabFilter: (tab: 'bot' | 'agent') => void
  markUnread: (conversationId: string) => void
  markRead: (conversationId: string) => void
}

export const useChatStore = create<ChatState>((set) => ({
  activeConversationId: null,
  searchQuery: '',
  tabFilter: 'bot',
  unreadConversationIds: new Set(),
  setActiveConversation: (id) =>
    set((state) => {
      const next = new Set(state.unreadConversationIds)
      if (id) next.delete(id)
      return { activeConversationId: id, unreadConversationIds: next }
    }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setTabFilter: (tab) => set({ tabFilter: tab }),
  markUnread: (conversationId) =>
    set((state) => {
      const next = new Set(state.unreadConversationIds)
      next.add(conversationId)
      return { unreadConversationIds: next }
    }),
  markRead: (conversationId) =>
    set((state) => {
      const next = new Set(state.unreadConversationIds)
      next.delete(conversationId)
      return { unreadConversationIds: next }
    }),
}))
