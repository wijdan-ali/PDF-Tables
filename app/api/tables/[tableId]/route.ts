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

    // Verify ownership
    const { data: existingTable } = await supabase
      .from('user_tables')
      .select('id')
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
      // Regenerate keys and validate
      const columns = body.columns.map((col, index) => {
        const key = col.key || generateVariableKey(col.label)
        return {
          label: col.label,
          key,
          desc: col.desc,
          order: col.order ?? index,
        }
      })

      const keys = columns.map((c) => c.key)
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

