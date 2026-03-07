import { create } from 'zustand'

interface ChatState {
  activeConversationId: string | null
  statusFilter: 'all' | 'open' | 'closed' | 'pending'
  searchQuery: string
  unreadConversationIds: Set<string>
  setActiveConversation: (id: string | null) => void
  setStatusFilter: (filter: 'all' | 'open' | 'closed' | 'pending') => void
  setSearchQuery: (query: string) => void
  markUnread: (conversationId: string) => void
  markRead: (conversationId: string) => void
}

export const useChatStore = create<ChatState>((set) => ({
  activeConversationId: null,
  statusFilter: 'open',
  searchQuery: '',
  unreadConversationIds: new Set(),
  setActiveConversation: (id) =>
    set((state) => {
      const next = new Set(state.unreadConversationIds)
      if (id) next.delete(id)
      return { activeConversationId: id, unreadConversationIds: next }
    }),
  setStatusFilter: (filter) => set({ statusFilter: filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  markUnread: (conversationId) =>
    set((state) => {
      if (state.activeConversationId === conversationId) return state
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
