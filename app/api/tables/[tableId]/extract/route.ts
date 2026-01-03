import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { extractFromPDF } from '@/lib/chatpdf/client'
import { buildExtractionPrompt } from '@/lib/chatpdf/prompt-builder'
import { sanitizeAndParseJSON, truncateForStorage } from '@/lib/chatpdf/sanitizer'
import { validateAndNormalize } from '@/lib/chatpdf/validator'
import type { ExtractResponse } from '@/types/api'

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
      .select('*')
      .eq('id', params.tableId)
      .eq('user_id', user.id)
      .single()

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    const body = await request.json()
    const { row_id } = body

    if (!row_id) {
      return NextResponse.json(
        { error: 'row_id is required' },
        { status: 400 }
      )
    }

    // Fetch row
    const { data: row, error: rowError } = await supabase
      .from('extracted_rows')
      .select('*')
      .eq('id', row_id)
      .eq('table_id', params.tableId)
      .single()

    if (rowError || !row) {
      return NextResponse.json(
        { error: 'Row not found' },
        { status: 404 }
      )
    }

    if (!row.file_path || row.file_path.trim() === '') {
      return NextResponse.json(
        { error: 'PDF file not uploaded' },
        { status: 400 }
      )
    }

    // Update status to extracting
    await supabase
      .from('extracted_rows')
      .update({ status: 'extracting' })
      .eq('id', row_id)

    // Get signed URL for PDF using service client (for storage operations)
    let serviceClient
    try {
      serviceClient = createServiceClient()
    } catch (serviceError) {
      await supabase
        .from('extracted_rows')
        .update({ 
          status: 'failed', 
          error: `Service client error: ${serviceError instanceof Error ? serviceError.message : 'Failed to create service client'}` 
        })
        .eq('id', row_id)
      
      return NextResponse.json(
        { error: 'Failed to initialize service client' },
        { status: 500 }
      )
    }

    const { data: signedUrlData, error: urlError } = await serviceClient.storage
      .from('documents')
      .createSignedUrl(row.file_path, 3600)

    if (urlError || !signedUrlData?.signedUrl) {
      await supabase
        .from('extracted_rows')
        .update({ 
          status: 'failed', 
          error: `Failed to generate PDF URL: ${urlError?.message || 'Unknown error'}` 
        })
        .eq('id', row_id)
      
      return NextResponse.json(
        { error: `Failed to generate PDF URL: ${urlError?.message || 'Unknown error'}` },
        { status: 500 }
      )
    }

    // Extract columns for prompt
    const columns = (table.columns as any[]).map((col: any) => ({
      key: col.key,
      desc: col.desc,
    }))

    if (columns.length === 0) {
      await supabase
        .from('extracted_rows')
        .update({
          status: 'failed',
          error: 'Table schema has no columns',
        })
        .eq('id', row_id)

      return NextResponse.json<ExtractResponse>({
        status: 'failed',
        error: 'Table schema has no columns',
      })
    }

    // Build extraction prompt
    const prompt = buildExtractionPrompt(columns)

    let rawResponse: string
    let extractedData: Record<string, any>

    try {
      // Call ChatPDF API
      const chatPDFResult = await extractFromPDF(signedUrlData.signedUrl, prompt)
      rawResponse = chatPDFResult.content

      // Sanitize and parse JSON
      const sanitizeResult = sanitizeAndParseJSON(rawResponse)

      if (!sanitizeResult.success || !sanitizeResult.data) {
        // Store failure with raw response
        const truncatedResponse = truncateForStorage(rawResponse)
        await supabase
          .from('extracted_rows')
          .update({
            status: 'failed',
            error: sanitizeResult.error || 'Failed to parse JSON response',
            raw_response: truncatedResponse,
          })
          .eq('id', row_id)

        return NextResponse.json<ExtractResponse>({
          status: 'failed',
          error: sanitizeResult.error || 'Failed to parse JSON response',
        })
      }

      // Validate and normalize against schema
      extractedData = validateAndNormalize(sanitizeResult.data, columns)
    } catch (error) {
      // Handle ChatPDF API errors or network issues
      const errorMessage = error instanceof Error ? error.message : 'Unknown extraction error'
      const truncatedError = truncateForStorage(errorMessage)

      await supabase
        .from('extracted_rows')
        .update({
          status: 'failed',
          error: errorMessage,
          raw_response: truncatedError,
        })
        .eq('id', row_id)

      return NextResponse.json<ExtractResponse>({
        status: 'failed',
        error: errorMessage,
      })
    }

    // Update row with extracted data
    // TODO: Generate thumbnail and store in Storage (deferred for MVP)
    const truncatedResponse = truncateForStorage(rawResponse)
    const { error: updateError } = await supabase
      .from('extracted_rows')
      .update({
        status: 'extracted',
        data: extractedData,
        error: null,
        raw_response: truncatedResponse, // Store for debugging
      })
      .eq('id', row_id)

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to update row: ${updateError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json<ExtractResponse>({
      status: 'extracted',
      data: extractedData,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

