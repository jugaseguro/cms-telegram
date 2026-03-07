export type Database = {
  public: {
    Tables: {
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
        }
        Relationships: []
      }
      conversations: {
        Row: {
          id: string
          customer_id: string
          assigned_agent_id: string | null
          status: 'open' | 'closed' | 'pending'
          last_message_at: string | null
          waiting_since: string | null
          first_response_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          customer_id: string
          assigned_agent_id?: string | null
          status?: 'open' | 'closed' | 'pending'
          last_message_at?: string | null
          waiting_since?: string | null
          first_response_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          customer_id?: string
          assigned_agent_id?: string | null
          status?: 'open' | 'closed' | 'pending'
          last_message_at?: string | null
          waiting_since?: string | null
          first_response_at?: string | null
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
          created_at: string
        }
        Insert: {
          id?: string
          trigger_text: string
          response_text: string
          shortcut?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          trigger_text?: string
          response_text?: string
          shortcut?: string | null
          is_active?: boolean
        }
        Relationships: []
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
      recontact_rules: {
        Row: {
          id: string
          name: string
          description: string | null
          condition_type: 'inactive_days' | 'no_payment' | 'vip_inactive'
          condition_days: number
          message_template: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          condition_type: 'inactive_days' | 'no_payment' | 'vip_inactive'
          condition_days?: number
          message_template: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          condition_type?: 'inactive_days' | 'no_payment' | 'vip_inactive'
          condition_days?: number
          message_template?: string
          is_active?: boolean
        }
        Relationships: []
      }
      recontact_logs: {
        Row: {
          id: string
          rule_id: string
          customer_id: string
          sent_at: string
        }
        Insert: {
          id?: string
          rule_id: string
          customer_id: string
          sent_at?: string
        }
        Update: {
          id?: string
          rule_id?: string
          customer_id?: string
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
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Customer = Database['public']['Tables']['customers']['Row']
export type Conversation = Database['public']['Tables']['conversations']['Row']
export type Message = Database['public']['Tables']['messages']['Row']
export type Transaction = Database['public']['Tables']['transactions']['Row']

export type ConversationWithCustomer = Conversation & {
  customers: Customer
  profiles: Profile | null
}

export type MessageWithSender = Message & {
  sender_profile?: Profile | null
}

export type AutoResponse = Database['public']['Tables']['auto_responses']['Row']
export type Label = Database['public']['Tables']['labels']['Row']
export type ConversationLabel = Database['public']['Tables']['conversation_labels']['Row']
export type RecontactRule = Database['public']['Tables']['recontact_rules']['Row']
export type RecontactLog = Database['public']['Tables']['recontact_logs']['Row']

export type ConversationWithCustomerAndLabels = ConversationWithCustomer & {
  conversation_labels?: { labels: Label }[]
}
