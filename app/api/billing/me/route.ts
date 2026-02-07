import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type PlanKey = 'starter' | 'pro'
type Interval = 'month' | 'year'

function monthStartISO(d = new Date()): string {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0))
  return start.toISOString().slice(0, 10) // YYYY-MM-DD
}

function priceFor(plan_key: string | null, interval: string | null): number | null {
  const plan = plan_key === 'starter' || plan_key === 'pro' ? (plan_key as PlanKey) : null
  const intv = interval === 'month' || interval === 'year' ? (interval as Interval) : null
  if (!plan || !intv) return null
  if (plan === 'starter' && intv === 'month') return 19
  if (plan === 'starter' && intv === 'year') return 180
  if (plan === 'pro' && intv === 'month') return 49
  if (plan === 'pro' && intv === 'year') return 468
  return null
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

    // Current subscription summary (if any). A user can have multiple historical rows;
    // we prefer the most recently updated one.
    const { data: subscription, error: subErr } = await supabase
      .from('billing_subscriptions')
      .select('stripe_subscription_id, status, price_id, plan_key, interval, cancel_at_period_end, current_period_end, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 })

    const paymentAmount = priceFor(subscription?.plan_key ?? null, subscription?.interval ?? null)

    return NextResponse.json({
      entitlement: entitlement ?? null,
      subscription: subscription
        ? {
            stripe_subscription_id: subscription.stripe_subscription_id,
            status: subscription.status,
            price_id: subscription.price_id,
            plan_key: subscription.plan_key,
            interval: subscription.interval,
            cancel_at_period_end: subscription.cancel_at_period_end,
            current_period_end: subscription.current_period_end,
            // Convenience for UI
            amount_usd: paymentAmount,
          }
        : null,
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

