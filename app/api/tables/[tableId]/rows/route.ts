import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

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
    // Prefer row_order for manual reordering, but gracefully fall back for older DBs
    // where the migration hasn't been applied yet.
    let rows: any[] | null = null
    let rowsError: any = null

    const primary = await supabase
      .from('extracted_rows')
      .select('*')
      .eq('table_id', params.tableId)
      .order('row_order', { ascending: false })
      .order('created_at', { ascending: false })

    rows = primary.data
    rowsError = primary.error

    // Missing column (migration not applied) → fallback to created_at ordering so the app still works.
    if (
      rowsError &&
      (rowsError.code === '42703' ||
        (typeof rowsError.message === 'string' &&
          rowsError.message.toLowerCase().includes('row_order') &&
          rowsError.message.toLowerCase().includes('does not exist')))
    ) {
      const fallback = await supabase
        .from('extracted_rows')
        .select('*')
        .eq('table_id', params.tableId)
        .order('created_at', { ascending: false })

      rows = fallback.data
      rowsError = fallback.error
    }

    if (rowsError) {
      return NextResponse.json({ error: rowsError.message }, { status: 500 })
    }

    // Use service client for Storage signed URLs (private bucket; avoids policy surprises)
    let serviceClient
    try {
      serviceClient = createServiceClient()
    } catch (serviceError) {
      return NextResponse.json(
        { error: `Service client error: ${serviceError instanceof Error ? serviceError.message : 'Failed to create service client'}` },
        { status: 500 }
      )
    }

    // Generate signed URLs for PDFs and thumbnails.
    // Use a longer expiry to avoid tokens expiring while the user is viewing the table.
    const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7 // 7 days
    const rowsWithUrls = await Promise.all(
      (rows || []).map(async (row) => {
        const filePath = typeof row.file_path === 'string' ? row.file_path.trim() : ''
        const thumbnailPath = typeof row.thumbnail_path === 'string' ? row.thumbnail_path.trim() : ''

        const pdfUrl = filePath
          ? await serviceClient.storage
              .from('documents')
              .createSignedUrl(filePath, SIGNED_URL_EXPIRES_IN_SECONDS)
              .then(({ data }) => data?.signedUrl)
          : undefined

        const thumbnailUrl = thumbnailPath
          ? await serviceClient.storage
              .from('documents')
              .createSignedUrl(thumbnailPath, SIGNED_URL_EXPIRES_IN_SECONDS)
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

