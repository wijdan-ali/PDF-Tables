import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.39.0'
import { corsHeaders } from '../_shared/cors.ts'

type UploadInitResponse = { row_id: string; upload_url: string }

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 })

  try {
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
    if (claimsErr || !userId) return json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json().catch(() => ({}))) as { tableId?: string }
    const tableId = body.tableId
    if (!tableId) return json({ error: 'tableId is required' }, { status: 400 })

    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Ensure table exists + user owns it (RLS enforces this).
    const { data: table, error: tableErr } = await userClient
      .from('user_tables')
      .select('id')
      .eq('id', tableId)
      .single()
    if (tableErr || !table) return json({ error: 'Table not found' }, { status: 404 })

    const rowId = crypto.randomUUID()
    const filePath = `user/${userId}/table/${tableId}/row/${rowId}.pdf`

    // Insert row (RLS allows insert into owned table).
    const { error: insertErr } = await userClient.from('extracted_rows').insert({
      id: rowId,
      table_id: tableId,
      file_path: '', // will be updated below
      status: 'uploaded',
      data: {},
      is_verified: false,
      row_order: Date.now() / 1000,
    })
    if (insertErr) return json({ error: `Failed to create row: ${insertErr.message}` }, { status: 500 })

    // Generate signed upload URL using secret key.
    const secretClient = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: signedUrlData, error: urlErr } = await secretClient.storage
      .from('documents')
      .createSignedUploadUrl(filePath)

    if (urlErr || !signedUrlData?.signedUrl) {
      return json({ error: `Failed to generate upload URL: ${urlErr?.message || 'Unknown error'}` }, { status: 500 })
    }

    const { error: updateErr } = await userClient.from('extracted_rows').update({ file_path: filePath }).eq('id', rowId)
    if (updateErr) {
      return json({ error: `Failed to update row: ${updateErr.message}` }, { status: 500 })
    }

    return json({ row_id: rowId, upload_url: signedUrlData.signedUrl } satisfies UploadInitResponse)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return json({ error: msg }, { status: 500 })
  }
})

