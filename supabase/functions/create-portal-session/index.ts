import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.90.1'
import { getCorsHeaders } from '../_shared/cors.ts'

type Body = { returnUrl?: string }

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
    const returnUrl = typeof body.returnUrl === 'string' ? body.returnUrl.trim() : ''
    if (!returnUrl) return json({ error: 'returnUrl is required' }, { status: 400, headers: corsHeaders })

    const secretClient = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: customer, error: custErr } = await secretClient
      .from('billing_customers')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (custErr) throw new Error(custErr.message)
    const stripeCustomerId = typeof customer?.stripe_customer_id === 'string' ? customer.stripe_customer_id : ''
    if (!stripeCustomerId) {
      return json({ error: 'No Stripe customer found for user' }, { status: 404, headers: corsHeaders })
    }

    const session = await stripePost('billing_portal/sessions', stripeSecretKey, {
      customer: stripeCustomerId,
      return_url: returnUrl,
    })

    const url = typeof session?.url === 'string' ? session.url : ''
    if (!url) throw new Error('Stripe portal URL missing')

    return json({ url }, { headers: corsHeaders })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return json({ error: msg }, { status: 500, headers: corsHeaders })
  }
})

