import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAppOrigin } from '@/lib/url'

export const runtime = 'nodejs'

type PlanKey = 'starter' | 'pro'
type Interval = 'month' | 'year'

function readEnv(...keys: string[]): string | null {
  for (const k of keys) {
    const v = process.env[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  return null
}

function isInternalPath(p: unknown): p is string {
  return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//')
}

function getPriceId(plan: PlanKey, interval: Interval): string | null {
  if (plan === 'starter' && interval === 'month') {
    return readEnv('STRIPE_PRICE_STARTER_MONTH', 'NEXT_PUBLIC_STRIPE_PRICE_STARTER_MONTH')
  }
  if (plan === 'starter' && interval === 'year') {
    return readEnv('STRIPE_PRICE_STARTER_YEAR', 'NEXT_PUBLIC_STRIPE_PRICE_STARTER_YEAR')
  }
  if (plan === 'pro' && interval === 'month') {
    return readEnv('STRIPE_PRICE_PRO_MONTH', 'NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTH')
  }
  if (plan === 'pro' && interval === 'year') {
    return readEnv('STRIPE_PRICE_PRO_YEAR', 'NEXT_PUBLIC_STRIPE_PRICE_PRO_YEAR')
  }
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
    if (!priceId) {
      const key =
        plan === 'starter' && interval === 'month'
          ? 'STRIPE_PRICE_STARTER_MONTH'
          : plan === 'starter' && interval === 'year'
            ? 'STRIPE_PRICE_STARTER_YEAR'
            : plan === 'pro' && interval === 'month'
              ? 'STRIPE_PRICE_PRO_MONTH'
              : 'STRIPE_PRICE_PRO_YEAR'
      return NextResponse.json(
        { error: `Stripe price env not configured: ${key} (or NEXT_PUBLIC_${key})` },
        { status: 500 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseUrl || !publishableKey) {
      return NextResponse.json({ error: 'Supabase env not configured' }, { status: 500 })
    }

    const appOrigin = getAppOrigin()

    const successUrl = `${appOrigin}/start?intent=app&returnTo=${encodeURIComponent(returnTo)}&billing=success`
    const cancelUrl = `${appOrigin}/start?intent=app&returnTo=${encodeURIComponent(returnTo)}&billing=cancel`

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

