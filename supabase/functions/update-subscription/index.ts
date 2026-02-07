import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.90.1'
import { getCorsHeaders } from '../_shared/cors.ts'

type Body = {
  priceId?: string
}

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

function getBearerToken(req: Request): string {
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization') ?? ''
  const [scheme, token] = authHeader.split(' ')
  if (scheme !== 'Bearer' || !token) throw new Error('Missing authorization header')
  return token
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

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders })

  try {
    const supabaseUrl = getEnv('SUPABASE_URL')
    const publishableKey = getEnv('SB_PUBLISHABLE_KEY')
    const secretKey = getEnv('SB_SECRET_KEY')
    const stripeSecretKey = getEnv('STRIPE_SECRET_KEY')

    const token = getBearerToken(req)

    // Verify JWT
    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(token)
    const userId = claimsData?.claims?.sub
    if (claimsErr || !userId) return json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })

    const body = (await req.json().catch(() => ({}))) as Body
    const priceId = typeof body.priceId === 'string' ? body.priceId.trim() : ''
    if (!priceId) return json({ error: 'priceId is required' }, { status: 400, headers: corsHeaders })

    // Read the current subscription from DB (service key, bypasses RLS).
    const serviceClient = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: subRow, error: subErr } = await serviceClient
      .from('billing_subscriptions')
      .select('stripe_subscription_id, status')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (subErr) return json({ error: subErr.message }, { status: 500, headers: corsHeaders })
    const stripeSubId = typeof subRow?.stripe_subscription_id === 'string' ? subRow.stripe_subscription_id : ''
    if (!stripeSubId) return json({ error: 'No active subscription found' }, { status: 404, headers: corsHeaders })

    // Retrieve subscription with item IDs so we can replace the existing subscription item.
    const subscription = await stripeGet(`subscriptions/${stripeSubId}?expand[]=items.data.price&expand[]=latest_invoice.payment_intent`, stripeSecretKey)
    const itemId = typeof subscription?.items?.data?.[0]?.id === 'string' ? subscription.items.data[0].id : ''
    if (!itemId) return json({ error: 'Subscription item not found' }, { status: 500, headers: corsHeaders })

    // Update subscription price with immediate proration invoice.
    // Stripe docs: proration_behavior=always_invoice for immediate charge.
    const updated = await stripePost(`subscriptions/${stripeSubId}`, stripeSecretKey, {
      'items[0][id]': itemId,
      'items[0][price]': priceId,
      proration_behavior: 'always_invoice',
      payment_behavior: 'default_incomplete',
      // Keep userId attached
      'metadata[user_id]': userId,
      'expand[0]': 'latest_invoice',
      'expand[1]': 'latest_invoice.payment_intent',
      'expand[2]': 'items.data.price',
    })

    const hostedInvoiceUrl =
      typeof updated?.latest_invoice?.hosted_invoice_url === 'string'
        ? updated.latest_invoice.hosted_invoice_url
        : null

    return json(
      {
        ok: true,
        url: hostedInvoiceUrl,
        subscription_id: updated?.id ?? stripeSubId,
        status: updated?.status ?? null,
      },
      { headers: corsHeaders }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return json({ error: msg }, { status: 500, headers: corsHeaders })
  }
})

