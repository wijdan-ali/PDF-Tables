/**
 * Supabase Service Role Client
 * Use this for server-side operations that need to bypass RLS
 * Only use when necessary and always verify user ownership manually
 */

import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

export function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service role credentials not configured')
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

