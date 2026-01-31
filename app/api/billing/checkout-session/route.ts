import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type PlanKey = 'starter' | 'pro'
type Interval = 'month' | 'year'

function isInternalPath(p: unknown): p is string {
  return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//')
}

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
      returnTo?: unknown
    }

    const plan = body.plan === 'starter' || body.plan === 'pro' ? (body.plan as PlanKey) : null
    const interval = body.interval === 'month' || body.interval === 'year' ? (body.interval as Interval) : null
    const returnTo = isInternalPath(body.returnTo) ? body.returnTo : '/tables'

    if (!plan) return NextResponse.json({ error: 'plan is required' }, { status: 400 })
    if (!interval) return NextResponse.json({ error: 'interval is required' }, { status: 400 })

    const priceId = getPriceId(plan, interval)
    if (!priceId) return NextResponse.json({ error: 'Stripe price env not configured' }, { status: 500 })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseUrl || !publishableKey) {
      return NextResponse.json({ error: 'Supabase env not configured' }, { status: 500 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) return NextResponse.json({ error: 'Missing NEXT_PUBLIC_APP_URL' }, { status: 500 })

    const successUrl = `${appUrl}/start?intent=app&returnTo=${encodeURIComponent(returnTo)}&billing=success`
    const cancelUrl = `${appUrl}/start?intent=app&returnTo=${encodeURIComponent(returnTo)}&billing=cancel`

    const fnRes = await fetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ priceId, successUrl, cancelUrl }),
    })

    const payload = (await fnRes.json().catch(() => ({}))) as any
    if (!fnRes.ok) {
      return NextResponse.json({ error: payload?.error || 'Failed to create checkout session' }, { status: fnRes.status })
    }

    const url = typeof payload?.url === 'string' ? payload.url : ''
    if (!url) return NextResponse.json({ error: 'Missing checkout url' }, { status: 500 })

    return NextResponse.json({ url })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

