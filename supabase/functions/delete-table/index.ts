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

    // Ensure table exists + user owns it (RLS)
    const { data: table, error: tableErr } = await userClient
      .from('user_tables')
      .select('id')
      .eq('id', tableId)
      .single()
    if (tableErr || !table) return json({ error: 'Table not found' }, { status: 404 })

    // Collect storage paths before deleting DB rows.
    const { data: rows, error: rowsErr } = await userClient
      .from('extracted_rows')
      .select('file_path,thumbnail_path')
      .eq('table_id', tableId)
    if (rowsErr) return json({ error: rowsErr.message }, { status: 500 })

    const paths = (rows ?? [])
      .flatMap((r: any) => [r?.file_path, r?.thumbnail_path])
      .map((p: any) => (typeof p === 'string' ? p.trim() : ''))
      .filter((p: string) => p.length > 0)

    const secretClient = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Delete storage objects first (batch).
    for (let i = 0; i < paths.length; i += 500) {
      const batch = paths.slice(i, i + 500)
      const { error: removeErr } = await secretClient.storage.from('documents').remove(batch)
      if (removeErr) return json({ error: `Failed to delete files: ${removeErr.message}` }, { status: 500 })
    }

    // Delete the table (cascades extracted_rows via FK).
    const { error: delErr } = await userClient.from('user_tables').delete().eq('id', tableId)
    if (delErr) return json({ error: delErr.message }, { status: 500 })

    return json({ success: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return json({ error: msg }, { status: 500 })
  }
})

