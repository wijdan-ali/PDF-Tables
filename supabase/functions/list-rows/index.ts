import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.90.1'
import { corsHeaders } from '../_shared/cors.ts'

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

    // Verify JWT
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

    // Verify ownership (RLS)
    const { data: table, error: tableErr } = await userClient
      .from('user_tables')
      .select('id')
      .eq('id', tableId)
      .single()
    if (tableErr || !table) return json({ error: 'Table not found' }, { status: 404 })

    // Fetch rows with row_order ordering, fallback if migration missing.
    let rows: any[] = []
    const primary = await userClient
      .from('extracted_rows')
      .select('*')
      .eq('table_id', tableId)
      .order('row_order', { ascending: false })
      .order('created_at', { ascending: false })

    if (!primary.error) {
      rows = primary.data ?? []
    } else if (
      primary.error.code === '42703' ||
      (typeof primary.error.message === 'string' &&
        primary.error.message.toLowerCase().includes('row_order') &&
        primary.error.message.toLowerCase().includes('does not exist'))
    ) {
      const fallback = await userClient
        .from('extracted_rows')
        .select('*')
        .eq('table_id', tableId)
        .order('created_at', { ascending: false })

      if (fallback.error) return json({ error: fallback.error.message }, { status: 500 })
      rows = fallback.data ?? []
    } else {
      return json({ error: primary.error.message }, { status: 500 })
    }

    const secretClient = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7 // 7 days
    const rowsWithUrls = await Promise.all(
      rows.map(async (row) => {
        const filePath = typeof row.file_path === 'string' ? row.file_path.trim() : ''
        const thumbnailPath = typeof row.thumbnail_path === 'string' ? row.thumbnail_path.trim() : ''

        const pdf_url = filePath
          ? await secretClient.storage
              .from('documents')
              .createSignedUrl(filePath, SIGNED_URL_EXPIRES_IN_SECONDS)
              .then(({ data }) => data?.signedUrl)
          : undefined

        const thumbnail_url = thumbnailPath
          ? await secretClient.storage
              .from('documents')
              .createSignedUrl(thumbnailPath, SIGNED_URL_EXPIRES_IN_SECONDS)
              .then(({ data }) => data?.signedUrl)
          : undefined

        return {
          ...row,
          pdf_url,
          thumbnail_url,
          data: row.data as Record<string, string | number | null>,
        }
      })
    )

    return json(rowsWithUrls)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return json({ error: msg }, { status: 500 })
  }
})

