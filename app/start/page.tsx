import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAppOrigin } from '@/lib/url'

type Intent = 'checkout' | 'trial_pro' | 'app'
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

function withQueryParam(path: string, key: string, value: string): string {
  const [base, qs] = path.split('?', 2)
  const sp = new URLSearchParams(qs ?? '')
  sp.set(key, value)
  const next = sp.toString()
  return next ? `${base}?${next}` : base
}

async function stripeCreateCheckoutSession(opts: {
  accessToken: string
  priceId: string
  successUrl: string
  cancelUrl: string
}): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!supabaseUrl || !publishableKey) throw new Error('Supabase env not configured')

  const fnRes = await fetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: publishableKey,
      Authorization: `Bearer ${opts.accessToken}`,
    },
    body: JSON.stringify({
      priceId: opts.priceId,
      successUrl: opts.successUrl,
      cancelUrl: opts.cancelUrl,
    }),
  })

  const payload = (await fnRes.json().catch(() => ({}))) as any
  if (!fnRes.ok) {
    throw new Error(payload?.error || 'Failed to create checkout session')
  }

  const url = typeof payload?.url === 'string' ? payload.url : ''
  if (!url) throw new Error('Missing checkout url')
  return url
}

export default async function StartPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const intentRaw = typeof searchParams?.intent === 'string' ? searchParams.intent : undefined
  const intent: Intent = intentRaw === 'checkout' || intentRaw === 'trial_pro' || intentRaw === 'app' ? intentRaw : 'app'

  const planRaw = typeof searchParams?.plan === 'string' ? searchParams.plan : undefined
  const plan: PlanKey | null = planRaw === 'starter' || planRaw === 'pro' ? planRaw : null

  const intervalRaw = typeof searchParams?.interval === 'string' ? searchParams.interval : undefined
  const interval: Interval | null = intervalRaw === 'month' || intervalRaw === 'year' ? intervalRaw : null

  const returnToRaw = typeof searchParams?.returnTo === 'string' ? searchParams.returnTo : undefined
  const returnTo = isInternalPath(returnToRaw) ? returnToRaw : '/tables'

  const billingRaw = typeof searchParams?.billing === 'string' ? searchParams.billing : undefined
  const billing = billingRaw === 'success' || billingRaw === 'cancel' ? billingRaw : null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Not logged in: bounce to login, preserving the full /start intent.
  if (!user) {
    const qs = new URLSearchParams()
    qs.set('intent', intent)
    if (plan) qs.set('plan', plan)
    if (interval) qs.set('interval', interval)
    qs.set('returnTo', returnTo)
    if (billing) qs.set('billing', billing)

    const startPath = `/start?${qs.toString()}`
    redirect(`/login?returnTo=${encodeURIComponent(startPath)}`)
  }

  // Logged in: execute intent.
  if (intent === 'trial_pro') {
    const { error } = await supabase.rpc('claim_pro_trial')
    // If trial is already claimed (or user is subscribed), just proceed to app.
    const next = billing ? withQueryParam(returnTo, 'billing', billing) : withQueryParam(returnTo, 'trial', error ? 'unavailable' : 'started')
    redirect(next)
  }

  if (intent === 'checkout') {
    if (!plan || !interval) redirect(returnTo)

    const priceId = getPriceId(plan, interval)
    if (!priceId) redirect(withQueryParam(returnTo, 'billing', 'error'))

    const {
      data: { session },
    } = await supabase.auth.getSession()

    const accessToken = session?.access_token
    if (!accessToken) redirect('/login')

    const appOrigin = getAppOrigin()

    const successUrl = `${appOrigin}/start?intent=app&returnTo=${encodeURIComponent(returnTo)}&billing=success`
    const cancelUrl = `${appOrigin}/start?intent=app&returnTo=${encodeURIComponent(returnTo)}&billing=cancel`

    const checkoutUrl = await stripeCreateCheckoutSession({ accessToken, priceId, successUrl, cancelUrl })
    redirect(checkoutUrl)
  }

  // intent=app (or unknown)
  const next = billing ? withQueryParam(returnTo, 'billing', billing) : returnTo
  redirect(next)
}

