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
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

