import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseUrl || !publishableKey) {
      return NextResponse.json({ error: 'Supabase env not configured' }, { status: 500 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) return NextResponse.json({ error: 'Missing NEXT_PUBLIC_APP_URL' }, { status: 500 })

    const body = (await request.json().catch(() => ({}))) as { returnTo?: unknown }
    const returnTo = typeof body.returnTo === 'string' && body.returnTo.startsWith('/') ? body.returnTo : '/settings'
    const returnUrl = `${appUrl}${returnTo}`

    const fnRes = await fetch(`${supabaseUrl}/functions/v1/create-portal-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ returnUrl }),
    })

    const payload = (await fnRes.json().catch(() => ({}))) as any
    if (!fnRes.ok) {
      return NextResponse.json({ error: payload?.error || 'Failed to create portal session' }, { status: fnRes.status })
    }

    const url = typeof payload?.url === 'string' ? payload.url : ''
    if (!url) return NextResponse.json({ error: 'Missing portal url' }, { status: 500 })

    return NextResponse.json({ url })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

