import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ExtractResponse } from '@/types/api'

export const runtime = 'nodejs'

interface RouteContext {
  params: {
    tableId: string
  }
}

type Provider = 'chatpdf' | 'gemini' | 'openrouter'

function normalizeProvider(provider: unknown): Provider {
  return provider === 'gemini' || provider === 'openrouter' ? provider : 'chatpdf'
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const supabase = await createClient()
    
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { row_id, provider } = body as { row_id?: string; provider?: Provider | string }
    const selectedProvider = normalizeProvider(provider)

    if (!row_id) {
      return NextResponse.json(
        { error: 'row_id is required' },
        { status: 400 }
      )
    }

    // Optional fast-fail (actual enforcement is inside the Edge Function as well).
    const { data: canExtract, error: canExtractErr } = await supabase.rpc('can_extract_document', { p_user_id: user.id })
    if (canExtractErr) {
      return NextResponse.json({ error: canExtractErr.message }, { status: 500 })
    }
    if (!canExtract) {
      return NextResponse.json(
        { error: 'Document limit reached. Upgrade to continue.' },
        { status: 402 }
      )
    }

    // Back-compat proxy: delegate to Supabase Edge Function so Vercel never needs AI secrets.
    const {
      data: { session },
    } = await supabase.auth.getSession()

    const accessToken = session?.access_token
    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseUrl || !publishableKey) {
      return NextResponse.json({ error: 'Supabase env not configured' }, { status: 500 })
    }

    const fnRes = await fetch(`${supabaseUrl}/functions/v1/extract-table`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        tableId: params.tableId,
        row_id,
        provider: selectedProvider,
      }),
    })

    const payload = (await fnRes.json().catch(() => ({}))) as any
    if (!fnRes.ok) {
      return NextResponse.json({ error: payload?.error || 'Extraction failed' }, { status: fnRes.status })
    }

    return NextResponse.json(payload as ExtractResponse)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

