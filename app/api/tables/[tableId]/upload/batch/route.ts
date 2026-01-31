import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: {
    tableId: string
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const MAX_PDF_BYTES = 50 * 1024 * 1024 // 50MB
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Batch upload is a Professional-only feature.
    const { data: entitlement, error: entErr } = await supabase
      .from('entitlements')
      .select('batch_enabled, tier')
      .eq('user_id', user.id)
      .maybeSingle()

    if (entErr) {
      return NextResponse.json({ error: entErr.message }, { status: 500 })
    }
    if (!entitlement?.batch_enabled) {
      return NextResponse.json(
        { error: 'Batch upload is available on the Professional plan only.' },
        { status: 403 }
      )
    }

    // Verify table ownership (fast fail before calling Edge Function)
    const { data: table } = await supabase
      .from('user_tables')
      .select('id')
      .eq('id', params.tableId)
      .eq('user_id', user.id)
      .single()

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      files?: Array<{ name?: string; size?: number }>
    }
    const files = Array.isArray(body.files) ? body.files : []
    if (files.length === 0) {
      return NextResponse.json({ error: 'files is required' }, { status: 400 })
    }

    for (const f of files) {
      const size = typeof f?.size === 'number' ? f.size : null
      if (size != null && size > MAX_PDF_BYTES) {
        return NextResponse.json(
          { error: `File is too large. Max size is ${Math.round(MAX_PDF_BYTES / (1024 * 1024))}MB.` },
          { status: 413 }
        )
      }
    }

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

    const fnRes = await fetch(`${supabaseUrl}/functions/v1/upload-init-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ tableId: params.tableId, files }),
    })

    const payload = (await fnRes.json().catch(() => ({}))) as any
    if (!fnRes.ok) {
      return NextResponse.json({ error: payload?.error || 'Failed to initiate batch upload' }, { status: fnRes.status })
    }

    return NextResponse.json(payload)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

