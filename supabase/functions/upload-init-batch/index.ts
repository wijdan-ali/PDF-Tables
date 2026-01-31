import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.90.1'
import { getCorsHeaders } from '../_shared/cors.ts'

type UploadInitBatchRequest = { tableId?: string; files?: Array<{ name?: string; size?: number }> }
type UploadInitBatchResponse = {
  items: Array<{ row_id: string; upload_url?: string; error?: string }>
}

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

function getEnv(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

function getBearerToken(req: Request): string {
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization') ?? ''
  const [scheme, token] = authHeader.split(' ')
  if (scheme !== 'Bearer' || !token) throw new Error('Missing authorization header')
  return token
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders })

  try {
    const MAX_PDF_BYTES = 50 * 1024 * 1024 // 50MB

    const supabaseUrl = getEnv('SUPABASE_URL')
    const publishableKey = getEnv('SB_PUBLISHABLE_KEY')
    const secretKey = getEnv('SB_SECRET_KEY')

    const token = getBearerToken(req)

    // Verify JWT (works with JWT signing keys).
    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(token)
    const userId = claimsData?.claims?.sub
    if (claimsErr || !userId) return json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })

    const body = (await req.json().catch(() => ({}))) as UploadInitBatchRequest
    const tableId = body.tableId
    const files = Array.isArray(body.files) ? body.files : []
    if (!tableId) return json({ error: 'tableId is required' }, { status: 400, headers: corsHeaders })
    if (files.length === 0) return json({ error: 'files is required' }, { status: 400, headers: corsHeaders })
    if (files.length > 50) return json({ error: 'Too many files (max 50)' }, { status: 400, headers: corsHeaders })

    // Optional size validation (client-provided size)
    for (const f of files) {
      const size = typeof f?.size === 'number' ? f.size : null
      if (size != null && size > MAX_PDF_BYTES) {
        return json(
          { error: `File is too large. Max size is ${Math.round(MAX_PDF_BYTES / (1024 * 1024))}MB.` },
          { status: 413, headers: corsHeaders }
        )
      }
    }

    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Batch upload is Professional-only (and enabled during pro trial).
    const entitlementCheck = await userClient
      .from('entitlements')
      .select('batch_enabled')
      .eq('user_id', userId)
      .maybeSingle()
    if (entitlementCheck.error) {
      return json({ error: entitlementCheck.error.message }, { status: 500, headers: corsHeaders })
    }
    if (!entitlementCheck.data?.batch_enabled) {
      return json(
        { error: 'Batch upload is available on the Professional plan only.' },
        { status: 403, headers: corsHeaders }
      )
    }

    // Ensure table exists + user owns it (RLS enforces this).
    const { data: table, error: tableErr } = await userClient
      .from('user_tables')
      .select('id')
      .eq('id', tableId)
      .single()
    if (tableErr || !table) return json({ error: 'Table not found' }, { status: 404, headers: corsHeaders })

    const nowOrder = Date.now() / 1000
    const rows = files.map((_, idx) => {
      const rowId = crypto.randomUUID()
      const filePath = `user/${userId}/table/${tableId}/row/${rowId}.pdf`
      return {
        rowId,
        filePath,
        insert: {
          id: rowId,
          table_id: tableId,
          file_path: filePath,
          status: 'uploaded',
          data: {},
          is_verified: false,
          // Keep stable ordering; newest first, but deterministic across the batch.
          row_order: nowOrder + (files.length - idx) / 1000,
        },
      }
    })

    // Insert all rows in one write.
    const { error: insertErr } = await userClient.from('extracted_rows').insert(rows.map((r) => r.insert))
    if (insertErr) return json({ error: `Failed to create rows: ${insertErr.message}` }, { status: 500, headers: corsHeaders })

    // Generate signed upload URLs using secret key.
    const secretClient = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const urlResults = await Promise.all(
      rows.map(async (r) => {
        try {
          const { data: signedUrlData, error: urlErr } = await secretClient.storage
            .from('documents')
            .createSignedUploadUrl(r.filePath)

          if (urlErr || !signedUrlData?.signedUrl) {
            const msg = urlErr?.message || 'Failed to generate upload URL'
            await userClient.from('extracted_rows').update({ status: 'failed', error: msg }).eq('id', r.rowId)
            return { row_id: r.rowId, error: msg }
          }

          return { row_id: r.rowId, upload_url: signedUrlData.signedUrl }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Failed to generate upload URL'
          await userClient.from('extracted_rows').update({ status: 'failed', error: msg }).eq('id', r.rowId)
          return { row_id: r.rowId, error: msg }
        }
      })
    )

    return json({ items: urlResults } satisfies UploadInitBatchResponse, { headers: corsHeaders })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return json({ error: msg }, { status: 500, headers: corsHeaders })
  }
})

