import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { UpdateRowRequest } from '@/types/api'

interface RouteContext {
  params: {
    rowId: string
  }
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const supabase = await createClient()
    
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch row (RLS ensures user can only access their own rows)
    const { data: row, error } = await supabase
      .from('extracted_rows')
      .select('*')
      .eq('id', params.rowId)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    return NextResponse.json(row)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const supabase = await createClient()
    
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: UpdateRowRequest = await request.json()
    const updateData: any = {
      updated_at: new Date().toISOString(),
    }

    if (body.data !== undefined) {
      updateData.data = body.data
    }

    if (body.is_verified !== undefined) {
      updateData.is_verified = body.is_verified
    }

    // Update row (RLS ensures user can only update their own rows)
    const { data: row, error } = await supabase
      .from('extracted_rows')
      .update(updateData)
      .eq('id', params.rowId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(row)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

