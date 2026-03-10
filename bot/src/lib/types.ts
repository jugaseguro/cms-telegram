export interface BotConfig {
  id: string
  name: string
  token: string
  telegram_username: string | null
  is_active: boolean
  color: string
  welcome_message: string | null
}

export interface Customer {
  id: string
  telegram_id: number
  telegram_username: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  status: 'new' | 'active' | 'inactive'
  uuid_landing: string | null
  last_activity: string | null
  bot_id: string
  created_at: string
}

export interface Conversation {
  id: string
  customer_id: string
  assigned_agent_id: string | null
  status: 'open' | 'closed' | 'pending'
  last_message_at: string | null
  bot_id: string
  created_at: string
}

export interface Message {
  id: string
  conversation_id: string
  sender_type: 'customer' | 'agent' | 'bot'
  sender_id: string | null
  content: string | null
  message_type: 'text' | 'image' | 'document' | 'receipt'
  media_url: string | null
  telegram_message_id: number | null
  created_at: string
}

export interface AutoResponse {
  id: string
  trigger_text: string
  response_text: string
  is_active: boolean
  bot_id: string | null
  created_at: string
}
