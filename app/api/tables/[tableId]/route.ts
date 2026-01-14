import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateVariableKey } from '@/lib/utils/slugify'
import type { UpdateTableRequest } from '@/types/api'

interface RouteContext {
  params: {
    tableId: string
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

    const { data: table, error } = await supabase
      .from('user_tables')
      .select('*')
      .eq('id', params.tableId)
      .eq('user_id', user.id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    return NextResponse.json(table)
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

    // Verify ownership + fetch existing columns for safer normalization
    const { data: existingTable } = await supabase
      .from('user_tables')
      .select('id, columns')
      .eq('id', params.tableId)
      .eq('user_id', user.id)
      .single()

    if (!existingTable) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    const body: UpdateTableRequest = await request.json()
    const updateData: any = {}

    if (body.table_name) {
      updateData.table_name = body.table_name
    }

    if (body.columns) {
      const existingColsRaw = (existingTable as any)?.columns
      const existingCols = Array.isArray(existingColsRaw) ? (existingColsRaw as any[]) : []
      const existingKeySet = new Set<string>(
        existingCols.map((c) => (typeof c?.key === 'string' ? c.key.trim() : '')).filter(Boolean)
      )
      const existingLabelToKey = new Map<string, string>()
      for (const c of existingCols) {
        const label = typeof c?.label === 'string' ? c.label.trim() : ''
        const key = typeof c?.key === 'string' ? c.key.trim() : ''
        if (label && key && !existingLabelToKey.has(label)) existingLabelToKey.set(label, key)
      }

      // Normalize keys and validate
      const usedKeys = new Set<string>(existingKeySet)
      const columns = body.columns.map((col, index) => {
        const label = (col.label ?? '').trim()
        const desc = (col.desc ?? '').trim()

        let key = typeof col.key === 'string' ? col.key.trim() : ''
        // If key missing, try to preserve an existing key by label before generating a new one.
        if (!key && label) {
          const prior = existingLabelToKey.get(label)
          if (prior) key = prior
        }
        if (!key && label) {
          const base = generateVariableKey(label)
          let candidate = base
          let n = 2
          while (usedKeys.has(candidate)) {
            candidate = `${base}_${n}`
            n += 1
          }
          key = candidate
        }
        usedKeys.add(key)

        return {
          label,
          key,
          desc,
          order: col.order ?? index,
        }
      })

      const keys = columns.map((c) => c.key)
      if (keys.some((k) => !k || typeof k !== 'string')) {
        return NextResponse.json({ error: 'Column keys are required' }, { status: 400 })
      }
      if (new Set(keys).size !== keys.length) {
        return NextResponse.json(
          { error: 'Column keys must be unique' },
          { status: 400 }
        )
      }

      updateData.columns = columns
    }

    updateData.updated_at = new Date().toISOString()

    const { data: table, error } = await supabase
      .from('user_tables')
      .update(updateData)
      .eq('id', params.tableId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(table)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Delegate to Edge Function so Vercel holds no secrets.
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

    const fnRes = await fetch(`${supabaseUrl}/functions/v1/delete-table`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ tableId: params.tableId }),
    })

    const payload = (await fnRes.json().catch(() => ({}))) as any
    if (!fnRes.ok) {
      return NextResponse.json({ error: payload?.error || 'Failed to delete table' }, { status: fnRes.status })
    }

    return NextResponse.json(payload)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
