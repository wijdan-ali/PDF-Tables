import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // No-card trial is enforced in Postgres via a security definer RPC.
    const { data, error } = await supabase.rpc('claim_pro_trial')
    if (error) {
      const msg = typeof error.message === 'string' ? error.message : 'Failed to start trial'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    // RPC returns a row; Supabase may return an array for table-returning RPCs.
    const row = Array.isArray(data) ? data[0] : data
    return NextResponse.json({ entitlement: row ?? null })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

