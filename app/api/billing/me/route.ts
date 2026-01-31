import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

function monthStartISO(d = new Date()): string {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0))
  return start.toISOString().slice(0, 10) // YYYY-MM-DD
}

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: entitlement, error: entErr } = await supabase
      .from('entitlements')
      .select('tier, trial_expires_at, docs_limit_monthly, docs_limit_trial, batch_enabled')
      .eq('user_id', user.id)
      .maybeSingle()

    if (entErr) return NextResponse.json({ error: entErr.message }, { status: 500 })

    const periodStart = monthStartISO()
    const { data: monthly, error: monthlyErr } = await supabase
      .from('usage_monthly')
      .select('docs_extracted, period_start')
      .eq('user_id', user.id)
      .eq('period_start', periodStart)
      .maybeSingle()
    if (monthlyErr) return NextResponse.json({ error: monthlyErr.message }, { status: 500 })

    const { data: trial, error: trialErr } = await supabase
      .from('usage_trial')
      .select('docs_extracted, trial_started_at, trial_expires_at')
      .eq('user_id', user.id)
      .maybeSingle()
    if (trialErr) return NextResponse.json({ error: trialErr.message }, { status: 500 })

    return NextResponse.json({
      entitlement: entitlement ?? null,
      usage: {
        monthly: monthly ?? { period_start: periodStart, docs_extracted: 0 },
        trial: trial ?? null,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

