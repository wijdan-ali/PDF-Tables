import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: {
    tableId: string
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

    // Check if request has file (server-side upload) or just metadata (client-side upload)
    const contentType = request.headers.get('content-type')
    const isMultipart = contentType?.includes('multipart/form-data')

    if (isMultipart) {
      // Server-side upload: file is in the request body
      const formData = await request.formData()
      const file = formData.get('file') as File
      const rowId = formData.get('row_id') as string

      if (!file || !rowId) {
        return NextResponse.json(
          { error: 'File and row_id are required' },
          { status: 400 }
        )
      }

      // Enforce PDF only
      const name = (file.name || '').toLowerCase()
      const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf')
      if (!isPdf) {
        return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
      }

      // Upload to Storage
      const filePath = `user/${user.id}/table/${params.tableId}/row/${rowId}.pdf`
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, {
          contentType: 'application/pdf',
          upsert: false,
        })

      if (uploadError) {
        return NextResponse.json(
          { error: `Upload failed: ${uploadError.message}` },
          { status: 500 }
        )
      }

      // Update row with file_path
      const { error: updateError } = await supabase
        .from('extracted_rows')
        .update({ file_path: filePath })
        .eq('id', rowId)

      if (updateError) {
        return NextResponse.json(
          { error: `Failed to update row: ${updateError.message}` },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true, row_id: rowId })
    } else {
      // Client-side upload: delegate to Edge Function so Vercel holds no secrets.
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

      const fnRes = await fetch(`${supabaseUrl}/functions/v1/upload-init`, {
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
        return NextResponse.json({ error: payload?.error || 'Failed to initiate upload' }, { status: fnRes.status })
      }

      return NextResponse.json(payload)
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

