import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { generateVariableKey } from '@/lib/utils/slugify'
import type { CreateTableRequest } from '@/types/api'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: CreateTableRequest = await request.json()

    if (!body.table_name) {
      return NextResponse.json(
        { error: 'Table name is required' },
        { status: 400 }
      )
    }

    // Generate keys and validate uniqueness (if columns provided)
    const columns = (body.columns || []).map((col, index) => {
      const key = generateVariableKey(col.label)
      return {
        label: col.label,
        key,
        desc: col.desc,
        order: index,
      }
    })

    if (columns.length > 0) {
    const keys = columns.map((c) => c.key)
    if (new Set(keys).size !== keys.length) {
      return NextResponse.json(
        { error: 'Column labels must be unique' },
        { status: 400 }
      )
      }
    }

    // Insert table
    const { data: table, error } = await supabase
      .from('user_tables')
      .insert({
        user_id: user.id,
        table_name: body.table_name,
        columns,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Ensure server-rendered pages that list tables (e.g. /tables) don’t stay stale.
    // This is especially important if the route is statically cached in some environments.
    revalidatePath('/tables')

    return NextResponse.json({ table }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Note: Supabase generated types may not include freshly added RPCs yet.
    // Cast to any to avoid build-time type errors until types are regenerated.
    const { data: tables, error } = await (supabase as any).rpc('get_user_tables_with_counts')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const normalized =
      (tables ?? []).map((t: any) => ({
        id: t.id,
        table_name: t.table_name,
        created_at: t.created_at,
        updated_at: t.updated_at,
        records_count: typeof t.records_count === 'number' ? t.records_count : Number(t.records_count ?? 0) || 0,
      })) ?? []

    return NextResponse.json(normalized)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

