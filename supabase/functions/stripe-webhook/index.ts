import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.90.1'
import { getCorsHeaders } from '../_shared/cors.ts'

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

function getEnv(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function parseStripeSignatureHeader(header: string): { t: number; v1: string[] } | null {
  const parts = header.split(',').map((p) => p.trim())
  const out: { t?: number; v1: string[] } = { v1: [] }
  for (const p of parts) {
    const [k, v] = p.split('=')
    if (!k || !v) continue
    if (k === 't') out.t = Number(v)
    if (k === 'v1') out.v1.push(v)
  }
  if (!out.t || out.v1.length === 0) return null
  return { t: out.t, v1: out.v1 }
}

function formEncode(params: Record<string, string | undefined | null>): string {
  const out: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    out.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
  }
  return out.join('&')
}

async function stripeGet(path: string, secretKey: string): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${secretKey}` },
  })
  const text = await res.text()
  const payload = text ? JSON.parse(text) : {}
  if (!res.ok) {
    const msg =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : `Stripe request failed (${res.status})`
    throw new Error(msg)
  }
  return payload
}

async function stripePost(path: string, secretKey: string, params: Record<string, string | undefined | null>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formEncode(params),
  })
  const text = await res.text()
  const payload = text ? JSON.parse(text) : {}
  if (!res.ok) {
    const msg =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : `Stripe request failed (${res.status})`
    throw new Error(msg)
  }
  return payload as any
}

type EntitlementUpdate =
  | { tier: 'starter'; docs_limit_monthly: number; docs_limit_trial: null; batch_enabled: false }
  | { tier: 'pro'; docs_limit_monthly: null; docs_limit_trial: null; batch_enabled: true }
  | { tier: 'free'; docs_limit_monthly: null; docs_limit_trial: null; batch_enabled: false }

function mapPriceToPlan(priceId: string, env: Record<string, string>) {
  if (priceId === env.STRIPE_PRICE_STARTER_MONTH) return { plan_key: 'starter', interval: 'month' }
  if (priceId === env.STRIPE_PRICE_STARTER_YEAR) return { plan_key: 'starter', interval: 'year' }
  if (priceId === env.STRIPE_PRICE_PRO_MONTH) return { plan_key: 'pro', interval: 'month' }
  if (priceId === env.STRIPE_PRICE_PRO_YEAR) return { plan_key: 'pro', interval: 'year' }
  return { plan_key: null as string | null, interval: null as string | null }
}

function isActivePaidStatus(status: string): boolean {
  // Stripe status values: active, trialing, past_due, canceled, unpaid, incomplete, incomplete_expired, paused
  // We'll consider only these as having paid entitlements:
  return status === 'active' || status === 'trialing'
}

function isTerminalDowngradeStatus(status: string): boolean {
  // These mean the subscription is no longer usable; we should remove paid entitlements.
  return status === 'canceled' || status === 'incomplete_expired'
}

function entitlementForPlan(plan_key: string | null, active: boolean): EntitlementUpdate {
  if (!active) return { tier: 'free', docs_limit_monthly: null, docs_limit_trial: null, batch_enabled: false }
  if (plan_key === 'starter') return { tier: 'starter', docs_limit_monthly: 200, docs_limit_trial: null, batch_enabled: false }
  if (plan_key === 'pro') return { tier: 'pro', docs_limit_monthly: null, docs_limit_trial: null, batch_enabled: true }
  return { tier: 'free', docs_limit_monthly: null, docs_limit_trial: null, batch_enabled: false }
}

async function upsertCustomer(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  stripeCustomerId: string
) {
  const { error } = await supabase
    .from('billing_customers')
    .upsert({ user_id: userId, stripe_customer_id: stripeCustomerId }, { onConflict: 'user_id' })
  if (error) throw new Error(`Failed to upsert billing_customers: ${error.message}`)
}

async function upsertSubscriptionAndEntitlement(
  supabase: ReturnType<typeof createClient>,
  env: Record<string, string>,
  userId: string,
  subscription: any
) {
  const stripeSubId = String(subscription?.id || '')
  if (!stripeSubId) throw new Error('Missing stripe subscription id')

  const status = String(subscription?.status || '')
  const cancelAtPeriodEnd = Boolean(subscription?.cancel_at_period_end)
  const currentPeriodStart = typeof subscription?.current_period_start === 'number' ? subscription.current_period_start : null
  const currentPeriodEnd = typeof subscription?.current_period_end === 'number' ? subscription.current_period_end : null

  const priceId =
    typeof subscription?.items?.data?.[0]?.price?.id === 'string' ? subscription.items.data[0].price.id : null
  const { plan_key, interval } = priceId ? mapPriceToPlan(priceId, env) : { plan_key: null, interval: null }

  const active = isActivePaidStatus(status)
  const terminal = isTerminalDowngradeStatus(status)

  const { error: subErr } = await supabase.from('billing_subscriptions').upsert(
    {
      user_id: userId,
      stripe_subscription_id: stripeSubId,
      status,
      cancel_at_period_end: cancelAtPeriodEnd,
      price_id: priceId,
      plan_key,
      interval,
      current_period_start: currentPeriodStart ? new Date(currentPeriodStart * 1000).toISOString() : null,
      current_period_end: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
    },
    { onConflict: 'stripe_subscription_id' }
  )
  if (subErr) throw new Error(`Failed to upsert billing_subscriptions: ${subErr.message}`)

  // Entitlements update rules:
  // - When subscription is active/trialing, set entitlements to match the Stripe price.
  // - When subscription is canceled/incomplete_expired, downgrade to free.
  // - When subscription is incomplete/past_due/unpaid/paused, DO NOT downgrade automatically.
  //   This prevents locking users out during upgrade flows (proration invoice pending) or transient payment issues.
  const isKnownPlan = plan_key === 'starter' || plan_key === 'pro'
  const shouldUpdateEntitlements = (active && isKnownPlan) || terminal
  if (shouldUpdateEntitlements) {
    const entitlement = terminal ? entitlementForPlan(null, false) : entitlementForPlan(plan_key, active)

    // IMPORTANT: Do not clear trial_claimed_at; users shouldn't be able to re-trial after churn.
    const { error: entErr } = await supabase
      .from('entitlements')
      .upsert(
        {
          user_id: userId,
          tier: entitlement.tier,
          docs_limit_monthly: entitlement.docs_limit_monthly,
          docs_limit_trial: entitlement.docs_limit_trial,
          batch_enabled: entitlement.batch_enabled,
          // Paid plans should not carry trial_expires_at forward as an active limiter.
          ...(entitlement.tier !== 'pro_trial' ? { trial_expires_at: null } : {}),
        },
        { onConflict: 'user_id' }
      )
    if (entErr) throw new Error(`Failed to upsert entitlements: ${entErr.message}`)
  }
}

async function resolveUserIdFromStripe(
  supabase: ReturnType<typeof createClient>,
  stripeCustomerId: string | null,
  fallbackUserId: string | null
): Promise<string | null> {
  if (stripeCustomerId) {
    const { data } = await supabase
      .from('billing_customers')
      .select('user_id')
      .eq('stripe_customer_id', stripeCustomerId)
      .maybeSingle()
    if (data?.user_id) return String(data.user_id)
  }
  return fallbackUserId
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders })

  try {
    const stripeWebhookSecret = getEnv('STRIPE_WEBHOOK_SECRET')
    const stripeSecretKey = getEnv('STRIPE_SECRET_KEY')
    const supabaseUrl = getEnv('SUPABASE_URL')
    const secretKey = getEnv('SB_SECRET_KEY')

    const env = {
      STRIPE_PRICE_STARTER_MONTH: getEnv('STRIPE_PRICE_STARTER_MONTH'),
      STRIPE_PRICE_STARTER_YEAR: getEnv('STRIPE_PRICE_STARTER_YEAR'),
      STRIPE_PRICE_PRO_MONTH: getEnv('STRIPE_PRICE_PRO_MONTH'),
      STRIPE_PRICE_PRO_YEAR: getEnv('STRIPE_PRICE_PRO_YEAR'),
    }

    const sigHeader = req.headers.get('Stripe-Signature') ?? ''
    const rawBody = await req.text()

    const parsedSig = parseStripeSignatureHeader(sigHeader)
    if (!parsedSig) return json({ error: 'Invalid Stripe-Signature header' }, { status: 400, headers: corsHeaders })

    // Optional timestamp tolerance (5 minutes).
    const nowSec = Math.floor(Date.now() / 1000)
    if (Math.abs(nowSec - parsedSig.t) > 300) {
      return json({ error: 'Signature timestamp out of tolerance' }, { status: 400, headers: corsHeaders })
    }

    const signedPayload = `${parsedSig.t}.${rawBody}`
    const expected = await hmacSha256Hex(stripeWebhookSecret, signedPayload)
    const ok = parsedSig.v1.some((v1) => timingSafeEqualHex(v1, expected))
    if (!ok) return json({ error: 'Invalid signature' }, { status: 400, headers: corsHeaders })

    const event = rawBody ? JSON.parse(rawBody) : {}
    const type = String(event?.type || '')
    const obj = event?.data?.object ?? null

    const supabase = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Handle Checkout completion by fetching the subscription (most complete representation).
    if (type === 'checkout.session.completed') {
      const session = obj
      const stripeCustomerId = typeof session?.customer === 'string' ? session.customer : null
      const stripeSubId = typeof session?.subscription === 'string' ? session.subscription : null
      const userIdFromClientRef = typeof session?.client_reference_id === 'string' ? session.client_reference_id : null
      const userIdFromMeta = typeof session?.metadata?.user_id === 'string' ? session.metadata.user_id : null
      const userId = await resolveUserIdFromStripe(supabase, stripeCustomerId, userIdFromClientRef ?? userIdFromMeta)
      if (!userId) return json({ ok: true }, { headers: corsHeaders })

      if (stripeCustomerId) await upsertCustomer(supabase, userId, stripeCustomerId)

      if (stripeSubId) {
        const subscription = await stripeGet(`subscriptions/${stripeSubId}?expand[]=items.data.price`, stripeSecretKey)
        await upsertSubscriptionAndEntitlement(supabase, env, userId, subscription)
      }

      return json({ ok: true }, { headers: corsHeaders })
    }

    // Subscription lifecycle updates.
    if (
      type === 'customer.subscription.created' ||
      type === 'customer.subscription.updated' ||
      type === 'customer.subscription.deleted'
    ) {
      const subscription = obj
      const stripeCustomerId = typeof subscription?.customer === 'string' ? subscription.customer : null
      const userIdFromMeta = typeof subscription?.metadata?.user_id === 'string' ? subscription.metadata.user_id : null
      const userId = await resolveUserIdFromStripe(supabase, stripeCustomerId, userIdFromMeta)
      if (!userId) return json({ ok: true }, { headers: corsHeaders })

      if (stripeCustomerId) await upsertCustomer(supabase, userId, stripeCustomerId)

      // Ensure price expansion; some events include it, some don't.
      const stripeSubId = String(subscription?.id || '')
      const fullSubscription = stripeSubId
        ? await stripeGet(`subscriptions/${stripeSubId}?expand[]=items.data.price`, stripeSecretKey)
        : subscription

      await upsertSubscriptionAndEntitlement(supabase, env, userId, fullSubscription)
      return json({ ok: true }, { headers: corsHeaders })
    }

    // Optional: keep customer mapping updated on customer.created
    if (type === 'customer.created') {
      const customer = obj
      const stripeCustomerId = typeof customer?.id === 'string' ? customer.id : null
      const userIdFromMeta = typeof customer?.metadata?.user_id === 'string' ? customer.metadata.user_id : null
      if (stripeCustomerId && userIdFromMeta) {
        await upsertCustomer(supabase, userIdFromMeta, stripeCustomerId)
      }
      return json({ ok: true }, { headers: corsHeaders })
    }

    // Ignore unhandled events.
    return json({ ok: true }, { headers: corsHeaders })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return json({ error: msg }, { status: 500, headers: corsHeaders })
  }
})

