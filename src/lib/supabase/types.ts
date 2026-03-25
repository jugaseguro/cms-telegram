export type SegmentationConditionField =
  | 'transaction_count'
  | 'total_amount'
  | 'avg_amount'
  | 'inactive_days'
  | 'has_paid'
  | 'status'
  | 'days_since_first_tx'

export type SegmentationConditionOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'

export interface SegmentationCondition {
  field: SegmentationConditionField
  operator: SegmentationConditionOperator
  value: string | number | boolean
}

export type Database = {
  public: {
    Tables: {
      bots: {
        Row: {
          id: string
          name: string
          telegram_username: string | null
          token_encrypted: string
          is_active: boolean
          color: string
          welcome_message: string | null
          ai_enabled: boolean
          ai_system_prompt: string | null
          ai_model: string
          ai_max_history: number
          casino_operator: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          telegram_username?: string | null
          token_encrypted: string
          is_active?: boolean
          color?: string
          welcome_message?: string | null
          ai_enabled?: boolean
          ai_system_prompt?: string | null
          ai_model?: string
          ai_max_history?: number
          casino_operator?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          telegram_username?: string | null
          token_encrypted?: string
          is_active?: boolean
          color?: string
          welcome_message?: string | null
          ai_enabled?: boolean
          ai_system_prompt?: string | null
          ai_model?: string
          ai_max_history?: number
          casino_operator?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string
          role: 'admin' | 'agent'
          avatar_url: string | null
          created_at: string
        }
        Insert: {
          id: string
          email: string
          full_name: string
          role?: 'admin' | 'agent'
          avatar_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          role?: 'admin' | 'agent'
          avatar_url?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          id: string
          telegram_id: number
          telegram_username: string | null
          first_name: string | null
          last_name: string | null
          phone: string | null
          status: 'new' | 'active' | 'inactive'
          has_paid: boolean
          uuid_landing: string | null
          last_activity: string | null
          casino_token: string | null
          casino_user_id: string | null
          casino_username: string | null
          casino_profile: Record<string, unknown> | null
          bot_id: string
          created_at: string
        }
        Insert: {
          id?: string
          telegram_id: number
          telegram_username?: string | null
          first_name?: string | null
          last_name?: string | null
          phone?: string | null
          status?: 'new' | 'active' | 'inactive'
          has_paid?: boolean
          uuid_landing?: string | null
          last_activity?: string | null
          casino_token?: string | null
          casino_user_id?: string | null
          casino_username?: string | null
          casino_profile?: Record<string, unknown> | null
          bot_id: string
          created_at?: string
        }
        Update: {
          id?: string
          telegram_id?: number
          telegram_username?: string | null
          first_name?: string | null
          last_name?: string | null
          phone?: string | null
          status?: 'new' | 'active' | 'inactive'
          has_paid?: boolean
          uuid_landing?: string | null
          last_activity?: string | null
          casino_token?: string | null
          casino_user_id?: string | null
          casino_username?: string | null
          casino_profile?: Record<string, unknown> | null
          bot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          }
        ]
      }
      conversations: {
        Row: {
          id: string
          customer_id: string
          assigned_agent_id: string | null
          status: 'open' | 'closed' | 'pending' | 'waiting_agent'
          last_message_at: string | null
          waiting_since: string | null
          first_response_at: string | null
          bot_id: string
          created_at: string
          ai_paused: boolean
          pending_action: Record<string, unknown> | null
        }
        Insert: {
          id?: string
          customer_id: string
          assigned_agent_id?: string | null
          status?: 'open' | 'closed' | 'pending'
          last_message_at?: string | null
          waiting_since?: string | null
          first_response_at?: string | null
          bot_id: string
          created_at?: string
          ai_paused?: boolean
          pending_action?: Record<string, unknown> | null
        }
        Update: {
          id?: string
          customer_id?: string
          assigned_agent_id?: string | null
          status?: 'open' | 'closed' | 'pending'
          last_message_at?: string | null
          waiting_since?: string | null
          first_response_at?: string | null
          bot_id?: string
          ai_paused?: boolean
          pending_action?: Record<string, unknown> | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          }
        ]
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          sender_type: 'customer' | 'agent' | 'bot'
          sender_id: string | null
          content: string | null
          message_type: 'text' | 'image' | 'document' | 'receipt'
          media_url: string | null
          telegram_message_id: number | null
          is_internal: boolean
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          sender_type: 'customer' | 'agent' | 'bot'
          sender_id?: string | null
          content?: string | null
          message_type?: 'text' | 'image' | 'document' | 'receipt'
          media_url?: string | null
          telegram_message_id?: number | null
          is_internal?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          sender_type?: 'customer' | 'agent' | 'bot'
          sender_id?: string | null
          content?: string | null
          message_type?: 'text' | 'image' | 'document' | 'receipt'
          media_url?: string | null
          telegram_message_id?: number | null
          is_internal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          }
        ]
      }
      transactions: {
        Row: {
          id: string
          customer_id: string
          conversation_id: string | null
          agent_id: string
          amount: number
          status: 'pending' | 'confirmed' | 'rejected'
          receipt_url: string | null
          notes: string | null
          bot_id: string
          created_at: string
        }
        Insert: {
          id?: string
          customer_id: string
          conversation_id?: string | null
          agent_id: string
          amount: number
          status?: 'pending' | 'confirmed' | 'rejected'
          receipt_url?: string | null
          notes?: string | null
          bot_id: string
          created_at?: string
        }
        Update: {
          id?: string
          customer_id?: string
          conversation_id?: string | null
          agent_id?: string
          amount?: number
          status?: 'pending' | 'confirmed' | 'rejected'
          receipt_url?: string | null
          notes?: string | null
          bot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          }
        ]
      }
      auto_responses: {
        Row: {
          id: string
          trigger_text: string
          response_text: string
          shortcut: string | null
          is_active: boolean
          bot_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          trigger_text: string
          response_text: string
          shortcut?: string | null
          is_active?: boolean
          bot_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          trigger_text?: string
          response_text?: string
          shortcut?: string | null
          is_active?: boolean
          bot_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_responses_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          }
        ]
      }
      labels: {
        Row: {
          id: string
          name: string
          color: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          color?: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          color?: string
        }
        Relationships: []
      }
      conversation_labels: {
        Row: {
          conversation_id: string
          label_id: string
        }
        Insert: {
          conversation_id: string
          label_id: string
        }
        Update: {
          conversation_id?: string
          label_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_labels_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          }
        ]
      }
      segmentation_rules: {
        Row: {
          id: string
          name: string
          description: string | null
          label_id: string
          conditions: SegmentationCondition[]
          is_active: boolean
          auto_remove: boolean
          bot_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          label_id: string
          conditions: SegmentationCondition[]
          is_active?: boolean
          auto_remove?: boolean
          bot_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          label_id?: string
          conditions?: SegmentationCondition[]
          is_active?: boolean
          auto_remove?: boolean
          bot_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "segmentation_rules_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segmentation_rules_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          }
        ]
      }
      customer_labels: {
        Row: {
          customer_id: string
          label_id: string
          assigned_by: 'manual' | 'auto'
          rule_id: string | null
          assigned_at: string
        }
        Insert: {
          customer_id: string
          label_id: string
          assigned_by?: 'manual' | 'auto'
          rule_id?: string | null
          assigned_at?: string
        }
        Update: {
          customer_id?: string
          label_id?: string
          assigned_by?: 'manual' | 'auto'
          rule_id?: string | null
          assigned_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_labels_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          }
        ]
      }
      segmentation_logs: {
        Row: {
          id: string
          rule_id: string
          customer_id: string
          label_id: string
          action: 'assigned' | 'removed'
          created_at: string
        }
        Insert: {
          id?: string
          rule_id: string
          customer_id: string
          label_id: string
          action: 'assigned' | 'removed'
          created_at?: string
        }
        Update: {
          id?: string
          rule_id?: string
          customer_id?: string
          label_id?: string
          action?: 'assigned' | 'removed'
        }
        Relationships: [
          {
            foreignKeyName: "segmentation_logs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "segmentation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segmentation_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segmentation_logs_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          }
        ]
      }
      recontact_rules: {
        Row: {
          id: string
          name: string
          description: string | null
          condition_type: 'inactive_days' | 'no_payment' | 'vip_inactive' | 'by_label'
          condition_days: number
          message_template: string
          is_active: boolean
          bot_id: string | null
          target_label_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          condition_type: 'inactive_days' | 'no_payment' | 'vip_inactive' | 'by_label'
          condition_days?: number
          message_template: string
          is_active?: boolean
          bot_id?: string | null
          target_label_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          condition_type?: 'inactive_days' | 'no_payment' | 'vip_inactive' | 'by_label'
          condition_days?: number
          message_template?: string
          is_active?: boolean
          bot_id?: string | null
          target_label_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recontact_rules_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recontact_rules_target_label_id_fkey"
            columns: ["target_label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          }
        ]
      }
      ai_usage_logs: {
        Row: {
          id: string
          conversation_id: string | null
          bot_id: string | null
          model: string
          prompt_tokens: number
          completion_tokens: number
          total_tokens: number
          cost_usd: number
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id?: string | null
          bot_id?: string | null
          model: string
          prompt_tokens?: number
          completion_tokens?: number
          total_tokens?: number
          cost_usd?: number
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string | null
          bot_id?: string | null
          model?: string
          prompt_tokens?: number
          completion_tokens?: number
          total_tokens?: number
          cost_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          }
        ]
      }
      recontact_logs: {
        Row: {
          id: string
          rule_id: string
          customer_id: string
          bot_id: string
          sent_at: string
        }
        Insert: {
          id?: string
          rule_id: string
          customer_id: string
          bot_id: string
          sent_at?: string
        }
        Update: {
          id?: string
          rule_id?: string
          customer_id?: string
          bot_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recontact_logs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "recontact_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recontact_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recontact_logs_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: Record<string, never>
        Returns: string
      }
      evaluate_segmentation_rule: {
        Args: { p_rule_id: string }
        Returns: { customer_id: string }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Bot = Database['public']['Tables']['bots']['Row']
export type BotPublic = Omit<Bot, 'token_encrypted' | 'welcome_message'> & { welcome_message?: string | null }
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Customer = Database['public']['Tables']['customers']['Row']
export type Conversation = Database['public']['Tables']['conversations']['Row']
export type Message = Database['public']['Tables']['messages']['Row']
export type Transaction = Database['public']['Tables']['transactions']['Row']

export type ConversationWithCustomer = Conversation & {
  customers: Customer
  profiles: Profile | null
  bots: BotPublic | null
}

export type MessageWithSender = Message & {
  sender_profile?: Profile | null
}

export type AutoResponse = Database['public']['Tables']['auto_responses']['Row']
export type Label = Database['public']['Tables']['labels']['Row']
export type ConversationLabel = Database['public']['Tables']['conversation_labels']['Row']
export type RecontactRule = Database['public']['Tables']['recontact_rules']['Row']
export type RecontactLog = Database['public']['Tables']['recontact_logs']['Row']

export type SegmentationRule = Database['public']['Tables']['segmentation_rules']['Row']
export type CustomerLabel = Database['public']['Tables']['customer_labels']['Row']
export type SegmentationLog = Database['public']['Tables']['segmentation_logs']['Row']

export type AiUsageLog = Database['public']['Tables']['ai_usage_logs']['Row']

export type AiUsageLogWithDetails = AiUsageLog & {
  conversations: { customers: Pick<Customer, 'first_name' | 'last_name' | 'telegram_username'> } | null
  bots: Pick<BotPublic, 'id' | 'name' | 'color'> | null
}

export type SegmentationRuleWithLabel = SegmentationRule & {
  labels: Label
}

export type CustomerLabelWithDetails = CustomerLabel & {
  labels: Label
}

export type ConversationWithCustomerAndLabels = ConversationWithCustomer & {
  conversation_labels?: { labels: Label }[]
}
