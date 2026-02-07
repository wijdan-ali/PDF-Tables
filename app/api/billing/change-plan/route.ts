import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type PlanKey = 'starter' | 'pro'
type Interval = 'month' | 'year'

function getPriceId(plan: PlanKey, interval: Interval): string | null {
  if (plan === 'starter' && interval === 'month') return process.env.STRIPE_PRICE_STARTER_MONTH ?? null
  if (plan === 'starter' && interval === 'year') return process.env.STRIPE_PRICE_STARTER_YEAR ?? null
  if (plan === 'pro' && interval === 'month') return process.env.STRIPE_PRICE_PRO_MONTH ?? null
  if (plan === 'pro' && interval === 'year') return process.env.STRIPE_PRICE_PRO_YEAR ?? null
  return null
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const {
      data: { session },
    } = await supabase.auth.getSession()
    const accessToken = session?.access_token
    if (!accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json().catch(() => ({}))) as {
      plan?: unknown
      interval?: unknown
    }

    const plan = body.plan === 'starter' || body.plan === 'pro' ? (body.plan as PlanKey) : null
    const interval = body.interval === 'month' || body.interval === 'year' ? (body.interval as Interval) : null
    if (!plan) return NextResponse.json({ error: 'plan is required' }, { status: 400 })
    if (!interval) return NextResponse.json({ error: 'interval is required' }, { status: 400 })

    const priceId = getPriceId(plan, interval)
    if (!priceId) return NextResponse.json({ error: 'Stripe price env not configured' }, { status: 500 })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseUrl || !publishableKey) {
      return NextResponse.json({ error: 'Supabase env not configured' }, { status: 500 })
    }

    const fnRes = await fetch(`${supabaseUrl}/functions/v1/update-subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ priceId }),
    })

    const payload = (await fnRes.json().catch(() => ({}))) as any
    if (!fnRes.ok) {
      return NextResponse.json({ error: payload?.error || 'Failed to update subscription' }, { status: fnRes.status })
    }

    return NextResponse.json({ ok: true, url: payload?.url ?? null })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

