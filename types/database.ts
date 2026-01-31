// This file will be generated from Supabase schema
// For now, we define a basic structure that matches our plan

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      user_settings: {
        Row: {
          user_id: string
          theme: string
          ai_provider: string
          sidebar_collapsed: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          theme?: string
          ai_provider?: string
          sidebar_collapsed?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          theme?: string
          ai_provider?: string
          sidebar_collapsed?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          company_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          company_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          full_name?: string | null
          company_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_tables: {
        Row: {
          id: string
          user_id: string
          table_name: string
          columns: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          table_name: string
          columns: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          table_name?: string
          columns?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      extracted_rows: {
        Row: {
          id: string
          table_id: string
          file_path: string
          thumbnail_path: string | null
          data: Json
          is_verified: boolean
          status: 'uploaded' | 'extracting' | 'extracted' | 'failed'
          error: string | null
          raw_response: string | null
          row_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          table_id: string
          file_path: string
          thumbnail_path?: string | null
          data: Json
          is_verified?: boolean
          status?: 'uploaded' | 'extracting' | 'extracted' | 'failed'
          error?: string | null
          raw_response?: string | null
          row_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          table_id?: string
          file_path?: string
          thumbnail_path?: string | null
          data?: Json
          is_verified?: boolean
          status?: 'uploaded' | 'extracting' | 'extracted' | 'failed'
          error?: string | null
          raw_response?: string | null
          row_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      billing_customers: {
        Row: {
          user_id: string
          stripe_customer_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          stripe_customer_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          stripe_customer_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      billing_subscriptions: {
        Row: {
          id: string
          user_id: string
          stripe_subscription_id: string
          status: string
          current_period_start: string | null
          current_period_end: string | null
          cancel_at_period_end: boolean
          price_id: string | null
          plan_key: string | null
          interval: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          stripe_subscription_id: string
          status: string
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          price_id?: string | null
          plan_key?: string | null
          interval?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          stripe_subscription_id?: string
          status?: string
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          price_id?: string | null
          plan_key?: string | null
          interval?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      entitlements: {
        Row: {
          user_id: string
          tier: string
          trial_claimed_at: string | null
          trial_expires_at: string | null
          docs_limit_monthly: number | null
          docs_limit_trial: number | null
          batch_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          tier?: string
          trial_claimed_at?: string | null
          trial_expires_at?: string | null
          docs_limit_monthly?: number | null
          docs_limit_trial?: number | null
          batch_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          tier?: string
          trial_claimed_at?: string | null
          trial_expires_at?: string | null
          docs_limit_monthly?: number | null
          docs_limit_trial?: number | null
          batch_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      usage_monthly: {
        Row: {
          user_id: string
          period_start: string
          docs_extracted: number
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          period_start: string
          docs_extracted?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          period_start?: string
          docs_extracted?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      usage_trial: {
        Row: {
          user_id: string
          trial_started_at: string
          trial_expires_at: string
          docs_extracted: number
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          trial_started_at: string
          trial_expires_at: string
          docs_extracted?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          trial_started_at?: string
          trial_expires_at?: string
          docs_extracted?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      claim_pro_trial: {
        Args: Record<string, never>
        Returns: {
          tier: string
          trial_expires_at: string | null
          docs_limit_trial: number | null
          batch_enabled: boolean
        }[]
      }
      can_extract_document: {
        Args: { p_user_id: string }
        Returns: boolean
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

