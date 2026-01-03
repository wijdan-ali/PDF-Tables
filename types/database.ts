// This file will be generated from Supabase schema
// For now, we define a basic structure that matches our plan

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
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
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}

