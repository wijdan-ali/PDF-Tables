import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export function createClient(): SupabaseClient<Database> {
  // Prefer Supabase "Publishable API key" (sb_publishable_...) on hosted platform.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
  }
  if (!key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  }
  if (!key.startsWith('sb_publishable_')) {
    throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a Publishable API key (sb_publishable_...). Legacy anon keys are disabled.')
  }

  return createBrowserClient<Database>(
    url,
    key
  )
}

