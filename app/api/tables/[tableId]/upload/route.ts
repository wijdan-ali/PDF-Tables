import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { v4 as uuidv4 } from 'uuid'

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
      // Client-side upload: create row and return signed upload URL
      const body = await request.json()
      const rowId = uuidv4()

      // Use service client for insert to bypass RLS (we've already verified ownership)
      let serviceClient
      try {
        serviceClient = createServiceClient()
      } catch (serviceError) {
        return NextResponse.json(
          { error: `Service client error: ${serviceError instanceof Error ? serviceError.message : 'Failed to create service client. Make sure SUPABASE_SERVICE_ROLE_KEY is set in .env.local'}` },
          { status: 500 }
        )
      }
      
      // Create row placeholder using service client (bypasses RLS)
      // Note: Don't use .select() after insert with service client as it may trigger RLS checks
      const { error: insertError } = await serviceClient
        .from('extracted_rows')
        .insert({
          id: rowId,
          table_id: params.tableId,
          file_path: '', // Will be set after upload
          status: 'uploaded',
          data: {},
          is_verified: false,
        })

      if (insertError) {
        console.error('Insert error details:', {
          message: insertError.message,
          code: insertError.code,
          details: insertError.details,
          hint: insertError.hint,
        })
        
        // Check if it's an RLS error and provide helpful message
        if (insertError.message.includes('row-level security') || insertError.code === '42501') {
          return NextResponse.json(
            { 
              error: `RLS policy violation: ${insertError.message}. This may indicate SUPABASE_SERVICE_ROLE_KEY is not set or the service client is not working correctly.` 
            },
            { status: 500 }
          )
        }
        
        return NextResponse.json(
          { error: `Failed to create row: ${insertError.message}` },
          { status: 500 }
        )
      }

      // Generate signed upload URL using service client for storage operations
      const filePath = `user/${user.id}/table/${params.tableId}/row/${rowId}.pdf`
      const { data: signedUrlData, error: urlError } = await serviceClient.storage
        .from('documents')
        .createSignedUploadUrl(filePath)

      if (urlError || !signedUrlData) {
        return NextResponse.json(
          { error: `Failed to generate upload URL: ${urlError?.message || 'Unknown error'}` },
          { status: 500 }
        )
      }

      // Update row with file_path (use service client for consistency)
      await serviceClient
        .from('extracted_rows')
        .update({ file_path: filePath })
        .eq('id', rowId)

      return NextResponse.json({
        row_id: rowId,
        upload_url: signedUrlData.signedUrl,
      })
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

