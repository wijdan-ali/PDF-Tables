import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: {
    rowId: string
  }
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

    const body = (await request.json().catch(() => ({}))) as { error?: string }
    const msg = typeof body.error === 'string' && body.error.trim() ? body.error.trim() : 'Upload/extraction failed'

    // RLS should ensure the user can only update their own rows.
    const { error } = await supabase
      .from('extracted_rows')
      .update({ status: 'failed', error: msg, updated_at: new Date().toISOString() })
      .eq('id', params.rowId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

