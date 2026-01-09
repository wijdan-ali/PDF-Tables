/**
 * Supabase elevated-privilege client (server-only)
 * Use this for server-side operations that need to bypass RLS
 * Only use when necessary and always verify user ownership manually
 */

import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

export function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Prefer Supabase "Secret API key" (sb_secret_...) on hosted platform.
  const secretKey = process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !secretKey) {
    throw new Error('Supabase secret credentials not configured')
  }

  return createClient<Database>(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

