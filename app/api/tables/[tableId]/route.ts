import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
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

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership
    const { data: table } = await supabase
      .from('user_tables')
      .select('id')
      .eq('id', params.tableId)
      .eq('user_id', user.id)
      .single()

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    let serviceClient
    try {
      serviceClient = createServiceClient()
    } catch (serviceError) {
      return NextResponse.json(
        {
          error:
            serviceError instanceof Error
              ? serviceError.message
                : 'Failed to create service client. Make sure SUPABASE_SECRET_KEY is set in .env.local',
        },
        { status: 500 }
      )
    }

    // Gather all file paths for this table so we can delete PDFs from Storage.
    const { data: rows, error: rowsError } = await serviceClient
      .from('extracted_rows')
      .select('file_path')
      .eq('table_id', params.tableId)

    if (rowsError) {
      return NextResponse.json({ error: rowsError.message }, { status: 500 })
    }

    const paths = (rows ?? [])
      .map((r: any) => (typeof r?.file_path === 'string' ? r.file_path.trim() : ''))
      .filter((p: string) => p.length > 0)

    if (paths.length) {
      // Supabase Storage remove supports up to ~1000 items; batch just in case.
      for (let i = 0; i < paths.length; i += 500) {
        const batch = paths.slice(i, i + 500)
        const { error: removeError } = await serviceClient.storage.from('documents').remove(batch)
        if (removeError) {
          return NextResponse.json({ error: `Failed to delete PDFs: ${removeError.message}` }, { status: 500 })
        }
      }
    }

    // Delete extracted rows for this table.
    const { error: delRowsError } = await serviceClient.from('extracted_rows').delete().eq('table_id', params.tableId)
    if (delRowsError) {
      return NextResponse.json({ error: delRowsError.message }, { status: 500 })
    }

    // Delete the table itself.
    const { error: delTableError } = await serviceClient
      .from('user_tables')
      .delete()
      .eq('id', params.tableId)
      .eq('user_id', user.id)

    if (delTableError) {
      return NextResponse.json({ error: delTableError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
