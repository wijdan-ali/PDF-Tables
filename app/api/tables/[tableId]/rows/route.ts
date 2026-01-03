import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

    // Verify table ownership
    const { data: table } = await supabase
      .from('user_tables')
      .select('id')
      .eq('id', params.tableId)
      .eq('user_id', user.id)
      .single()

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    // Fetch rows (RLS will ensure user can only see their own rows)
    const { data: rows, error } = await supabase
      .from('extracted_rows')
      .select('*')
      .eq('table_id', params.tableId)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Generate signed URLs for PDFs and thumbnails
    const rowsWithUrls = await Promise.all(
      (rows || []).map(async (row) => {
        const pdfUrl = row.file_path
          ? await supabase.storage
              .from('documents')
              .createSignedUrl(row.file_path, 3600)
              .then(({ data }) => data?.signedUrl)
          : undefined

        const thumbnailUrl = row.thumbnail_path
          ? await supabase.storage
              .from('documents')
              .createSignedUrl(row.thumbnail_path, 3600)
              .then(({ data }) => data?.signedUrl)
          : undefined

        return {
          ...row,
          pdf_url: pdfUrl,
          thumbnail_url: thumbnailUrl,
          data: row.data as Record<string, string | number | null>,
        }
      })
    )

    return NextResponse.json(rowsWithUrls)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

