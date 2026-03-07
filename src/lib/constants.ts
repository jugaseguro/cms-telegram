export const CONVERSATION_STATUS_COLORS: Record<string, string> = {
  open: 'bg-status-success-bg text-status-success-text',
  pending: 'bg-status-warning-bg text-status-warning-text',
  closed: 'bg-status-neutral-bg text-status-neutral-text',
}

export const CUSTOMER_STATUS_COLORS: Record<string, string> = {
  new: 'bg-status-info-bg text-status-info-text',
  active: 'bg-status-success-bg text-status-success-text',
  inactive: 'bg-status-neutral-bg text-status-neutral-text',
}

export const TRANSACTION_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-status-warning-bg text-status-warning-text',
  confirmed: 'bg-status-success-bg text-status-success-text',
  rejected: 'bg-status-error-bg text-status-error-text',
}

export const DASHBOARD_CARDS_CONFIG = [
  {
    title: 'Conversaciones totales',
    key: 'totalConversations' as const,
    color: 'bg-primary/10 text-primary',
  },
  {
    title: 'Chats abiertos',
    key: 'openConversations' as const,
    color: 'bg-status-warning-bg text-status-warning-icon',
  },
  {
    title: 'Clientes',
    key: 'totalCustomers' as const,
    color: 'bg-status-success-bg text-status-success-icon',
  },
  {
    title: 'Transacciones pendientes',
    key: 'pendingTransactions' as const,
    color: 'bg-status-info-bg text-status-info-icon',
  },
]
