import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.90.1'
import { getCorsHeaders } from '../_shared/cors.ts'
import { GoogleGenAI, createPartFromUri } from 'npm:@google/genai@1.34.0'

type Provider = 'chatpdf' | 'gemini' | 'openrouter'

type ExtractResponse = {
  status: 'extracting' | 'extracted' | 'failed'
  data?: Record<string, string | number | null>
  error?: string
}

type Column = { key: string; desc: string }

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

function getEnvOptional(name: string): string | undefined {
  const v = Deno.env.get(name)?.trim()
  return v ? v : undefined
}

function normalizeProvider(provider: unknown): Provider {
  return provider === 'gemini' || provider === 'openrouter' ? provider : 'chatpdf'
}

function getBearerToken(req: Request): string {
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization') ?? ''
  const [scheme, token] = authHeader.split(' ')
  if (scheme !== 'Bearer' || !token) {
    throw new Error('Missing authorization header')
  }
  return token
}

function buildExtractionPrompt(columns: Column[]): string {
  if (columns.length === 0) throw new Error('Schema must have at least one column')

  const schemaLines = columns.map((col) => `- ${col.key}: ${col.desc}`).join('\n')
  const exampleKeys = columns.map((col) => `"${col.key}": ""`).join(', ')
  const exampleFormat = `{ ${exampleKeys} }`

  return `You are a data extraction engine.

Extract data from the provided document based on the schema below.

Rules:
1) Return ONLY one raw JSON object. No markdown fences, no explanations.
2) Output keys MUST exactly match the schema keys.
3) If a field is missing/unknown, set its value to null.
4) Values should be concise. Do not include surrounding commentary.

Schema (keys and descriptions):
${schemaLines}

Return format:
${exampleFormat}`
}

function truncateForStorage(text: string, maxLength = 20000): string {
  return text.length <= maxLength ? text : text.substring(0, maxLength) + '... [truncated]'
}

function sanitizeAndParseJSON(
  responseText: string
): { success: true; data: Record<string, unknown> } | { success: false; error: string } {
  try {
    let cleaned = responseText.trim()
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '')
    cleaned = cleaned.replace(/\s*```$/i, '')

    const jsonStart = cleaned.indexOf('{')
    if (jsonStart === -1) return { success: false, error: 'No JSON object found in response' }

    let braceDepth = 0
    let jsonEnd = -1
    for (let i = jsonStart; i < cleaned.length; i++) {
      const ch = cleaned[i]
      if (ch === '{') braceDepth++
      else if (ch === '}') {
        braceDepth--
        if (braceDepth === 0) {
          jsonEnd = i + 1
          break
        }
      }
    }
    if (jsonEnd === -1) return { success: false, error: 'Unclosed JSON object in response' }

    const jsonCandidate = cleaned.substring(jsonStart, jsonEnd)
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonCandidate)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      return { success: false, error: `JSON parse error: ${msg}` }
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { success: false, error: 'Parsed value is not a plain object' }
    }
    return { success: true, data: parsed as Record<string, unknown> }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown sanitization error'
    return { success: false, error: msg }
  }
}

function validateAndNormalize(
  extractedData: Record<string, unknown>,
  schemaColumns: Column[]
): Record<string, string | number | null> {
  const normalized: Record<string, string | number | null> = {}
  for (const { key } of schemaColumns) {
    const v = extractedData[key]
    normalized[key] = v === undefined ? null : (v as any)
  }
  return normalized
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  opts?: { maxRetries?: number; baseDelayMs?: number; retryStatus?: number[] }
) {
  const maxRetries = opts?.maxRetries ?? 1
  const baseDelayMs = opts?.baseDelayMs ?? 800
  const retryStatus = opts?.retryStatus ?? [429, 500, 502, 503, 504]

  let lastErr: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(input, init)
      if (res.ok || !retryStatus.includes(res.status) || attempt >= maxRetries) return res
      await sleep(baseDelayMs * Math.pow(2, attempt))
    } catch (e) {
      lastErr = e
      if (attempt >= maxRetries) throw e
      await sleep(baseDelayMs * Math.pow(2, attempt))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('fetchWithRetry failed')
}

async function extractWithChatPDF(pdfUrl: string, prompt: string): Promise<string> {
  const apiKey = getEnv('CHATPDF_API_KEY')
  const base = 'https://api.chatpdf.com/v1'

  const addRes = await fetchWithRetry(`${base}/sources/add-url`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: pdfUrl }),
  })

  if (!addRes.ok) {
    const t = await addRes.text().catch(() => '')
    throw new Error(`ChatPDF API error: ${addRes.status} ${t}`)
  }

  const addData = (await addRes.json()) as { sourceId?: string }
  if (!addData.sourceId) throw new Error('ChatPDF did not return a sourceId')

  const msgRes = await fetchWithRetry(`${base}/chats/message`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sourceId: addData.sourceId,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!msgRes.ok) {
    const t = await msgRes.text().catch(() => '')
    throw new Error(`ChatPDF API error: ${msgRes.status} ${t}`)
  }

  const msgData = (await msgRes.json()) as { content?: string }
  if (!msgData.content) throw new Error('ChatPDF returned an empty response.')
  return msgData.content
}

async function uploadRemotePDFToGemini(ai: any, url: string, displayName: string) {
  const pdfBuffer = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Failed to fetch PDF: ${r.status} ${r.statusText}`)
    return r.arrayBuffer()
  })
  const fileBlob = new Blob([pdfBuffer], { type: 'application/pdf' })
  const file = await ai.files.upload({
    file: fileBlob as any,
    config: { displayName },
  })

  let getFile = await ai.files.get({ name: (file as any).name })
  let tries = 0
  while ((getFile as any).state === 'PROCESSING' && tries < 24) {
    tries += 1
    await sleep(2500)
    getFile = await ai.files.get({ name: (file as any).name })
  }
  if ((getFile as any).state === 'FAILED') throw new Error('Gemini file processing failed.')
  if ((getFile as any).state === 'PROCESSING') throw new Error('Gemini file processing timed out.')

  return getFile
}

async function extractWithGemini(pdfUrl: string, prompt: string, displayName: string): Promise<string> {
  const apiKey = getEnv('GEMINI_API_KEY')
  const ai = new GoogleGenAI({ apiKey })

  const file = await uploadRemotePDFToGemini(ai, pdfUrl, displayName)
  const uri = (file as any).uri
  const mimeType = (file as any).mimeType
  if (!uri || !mimeType) throw new Error('Gemini file upload did not return uri/mimeType.')

  const filePart = createPartFromUri(uri, mimeType)
  const model = 'gemini-2.5-flash'

  const resp: any = await ai.models.generateContent({
    model,
    contents: [prompt, filePart],
  })

  const text =
    typeof resp?.text === 'function'
      ? await resp.text()
      : typeof resp?.text === 'string'
        ? resp.text
        : resp?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('') ?? ''

  if (!text) throw new Error('Gemini returned an empty response.')
  return text
}

async function extractWithOpenRouter(pdfUrl: string, prompt: string, displayName: string): Promise<string> {
  const apiKey = getEnv('OPENROUTER_API_KEY')
  const httpReferer = getEnvOptional('OPENROUTER_HTTP_REFERER')
  const xTitle = getEnvOptional('OPENROUTER_X_TITLE')
  const model = getEnvOptional('OPENROUTER_MODEL') ?? 'arcee-ai/trinity-large-preview:free'
  const fallbackModel = getEnvOptional('OPENROUTER_FALLBACK_MODEL') ?? 'arcee-ai/trinity-large-preview:free'
  // Force deterministic parsing for broad model compatibility.
  const pdfEngine = 'native'

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
  if (httpReferer) headers['HTTP-Referer'] = httpReferer
  if (xTitle) headers['X-Title'] = xTitle

  const filename = displayName.endsWith('.pdf') ? displayName : `${displayName}.pdf`
  const plugins = [
    {
      id: 'file-parser',
      pdf: { engine: pdfEngine },
    },
  ]

  const payload: Record<string, unknown> = {
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'file',
            file: {
              filename,
              file_data: pdfUrl,
            },
          },
        ],
      },
    ],
    stream: false,
    provider: {
      allow_fallbacks: true,
      require_parameters: true,
    },
    plugins,
  }
  if (fallbackModel && fallbackModel !== model) {
    payload.models = [model, fallbackModel]
  } else {
    payload.model = model
  }

  const completionRes = await fetchWithRetry(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    },
    { maxRetries: 1, baseDelayMs: 800, retryStatus: [429, 500, 502, 503, 504] }
  )

  if (!completionRes.ok) {
    const text = await completionRes.text().catch(() => '')
    let details = text
    try {
      const parsed = JSON.parse(text)
      const providerName = parsed?.error?.metadata?.provider_name
      const providerRaw = parsed?.error?.metadata?.raw
      if (providerName || providerRaw) {
        details = `${parsed?.error?.message || 'Provider returned error'} (provider=${providerName || 'unknown'}, raw=${providerRaw || 'n/a'})`
      }
    } catch {
      // Keep raw text if it's not JSON.
    }
    throw new Error(`OpenRouter API error: ${completionRes.status} ${details}`)
  }

  const completion: any = await completionRes.json()

  const content = completion?.choices?.[0]?.message?.content
  if (typeof content === 'string' && content.trim()) return content
  if (Array.isArray(content)) {
    const text = content
      .map((part: any) => (part?.type === 'text' && typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim()
    if (text) return text
  }
  throw new Error('OpenRouter returned an empty response.')
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders })

  try {
    const supabaseUrl = getEnv('SUPABASE_URL')
    // Prefer hosted-platform API keys. These are NOT provided by default in the Edge Functions env,
    // so expose them via secrets:
    // - SB_PUBLISHABLE_KEY=sb_publishable_...
    // - SB_SECRET_KEY=sb_secret_...
    // OpenRouter provider secrets/config:
    // - OPENROUTER_API_KEY=...
    // - OPENROUTER_MODEL=... (optional, defaults to anthropic/claude-sonnet-4)
    // - OPENROUTER_FALLBACK_MODEL=... (optional, defaults to anthropic/claude-sonnet-4)
    // - OPENROUTER_HTTP_REFERER=... (optional)
    // - OPENROUTER_X_TITLE=... (optional)
    // - OPENROUTER_PDF_ENGINE=... (optional, defaults to pdf-text; e.g. mistral-ocr)
    const publishableKey = getEnv('SB_PUBLISHABLE_KEY')
    const secretKey = getEnv('SB_SECRET_KEY')

    // We implement auth explicitly instead of relying on the platform "verify_jwt" flag,
    // which is incompatible with non-JWT API keys.
    const token = getBearerToken(req)

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(token)
    const userId = claimsData?.claims?.sub
    if (claimsErr || !userId) return json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })

    // Use the user's JWT for all DB operations so RLS is enforced.
    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const body = (await req.json().catch(() => ({}))) as {
      tableId?: string
      table_id?: string
      row_id?: string
      provider?: Provider | string
    }

    const tableId = body.tableId ?? body.table_id
    const rowId = body.row_id
    const provider: Provider = normalizeProvider(body.provider)

    if (!tableId) return json({ error: 'tableId is required' }, { status: 400, headers: corsHeaders })
    if (!rowId) return json({ error: 'row_id is required' }, { status: 400, headers: corsHeaders })

    // Use the authed client so RLS enforces ownership.
    const { data: table, error: tableErr } = await userClient
      .from('user_tables')
      .select('id, columns')
      .eq('id', tableId)
      .single()

    if (tableErr || !table) return json({ error: 'Table not found' }, { status: 404, headers: corsHeaders })

    const { data: row, error: rowErr } = await userClient
      .from('extracted_rows')
      .select('id, table_id, file_path, status, data, updated_at')
      .eq('id', rowId)
      .eq('table_id', tableId)
      .single()

    if (rowErr || !row) return json({ error: 'Row not found' }, { status: 404, headers: corsHeaders })
    if (!row.file_path || String(row.file_path).trim() === '') {
      return json({ error: 'PDF file not uploaded' }, { status: 400, headers: corsHeaders })
    }

    // Idempotency + stuck-extracting mitigation:
    // - If already extracted, return immediately (no re-run).
    // - If extracting and recently updated, avoid duplicate concurrent work.
    const EXTRACTING_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes
    const updatedAtMs = row.updated_at ? Date.parse(String(row.updated_at)) : NaN
    const updatedAgeMs = Number.isFinite(updatedAtMs) ? Date.now() - updatedAtMs : Infinity

    if (row.status === 'extracted') {
      return json(
        { status: 'extracted', data: (row as any).data as Record<string, string | number | null> } satisfies ExtractResponse,
        { headers: corsHeaders }
      )
    }
    if (row.status === 'extracting' && updatedAgeMs < EXTRACTING_TIMEOUT_MS) {
      return json({ status: 'extracting' } satisfies ExtractResponse, { headers: corsHeaders })
    }

    // Enforce plan limits BEFORE starting extraction.
    // Counting semantics: only successful extractions count, but we still gate before work begins.
    const { data: canExtract, error: canExtractErr } = await userClient.rpc('can_extract_document', {
      p_user_id: userId,
    })
    if (canExtractErr) {
      return json({ error: canExtractErr.message }, { status: 500, headers: corsHeaders })
    }
    if (!canExtract) {
      const { data: ent } = await userClient
        .from('entitlements')
        .select('tier, trial_expires_at, docs_limit_monthly, docs_limit_trial')
        .eq('user_id', userId)
        .maybeSingle()

      let msg = 'Document limit reached. Upgrade to continue.'
      if (ent?.tier === 'starter') {
        msg = `Starter plan limit reached (${ent.docs_limit_monthly ?? 200} documents/month). Upgrade to Professional to unlock unlimited documents and batch uploads.`
      } else if (ent?.tier === 'pro_trial') {
        const expired = ent.trial_expires_at ? Date.parse(ent.trial_expires_at) <= Date.now() : true
        msg = expired
          ? 'Your 7-day trial has ended. Upgrade to Professional to continue extracting.'
          : `Trial limit reached (${ent.docs_limit_trial ?? 50} documents). Upgrade to Professional to continue extracting.`
      }

      // Best-effort: mark row as failed so the UI surfaces the message.
      await userClient.from('extracted_rows').update({ status: 'failed', error: msg }).eq('id', rowId)
      return json({ status: 'failed', error: msg } satisfies ExtractResponse, { headers: corsHeaders })
    }

    // Move to extracting early (UI + polling) with a best-effort concurrency guard.
    // If another invocation already flipped the row to extracting, this update will no-op.
    const eligibleStatuses: Array<'uploaded' | 'failed'> = ['uploaded', 'failed']
    const canRetryStaleExtracting = row.status === 'extracting' && updatedAgeMs >= EXTRACTING_TIMEOUT_MS

    const startQuery = userClient
      .from('extracted_rows')
      .update({ status: 'extracting', error: null })
      .eq('id', rowId)
      .select('id, status, updated_at')

    const startRes = canRetryStaleExtracting
      ? await startQuery
      : await startQuery.in('status', eligibleStatuses)

    if (startRes.error) {
      return json({ error: startRes.error.message }, { status: 500, headers: corsHeaders })
    }
    // If no rows were updated, someone else likely started extraction first.
    if (!startRes.data || (Array.isArray(startRes.data) && startRes.data.length === 0)) {
      return json({ status: 'extracting' } satisfies ExtractResponse, { headers: corsHeaders })
    }

    // Storage signed URL should not be done with publishable key.
    const serviceClient = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: signedUrlData, error: urlErr } = await serviceClient.storage
      .from('documents')
      .createSignedUrl(row.file_path, 3600)

    if (urlErr || !signedUrlData?.signedUrl) {
      const msg = `Failed to generate PDF URL: ${urlErr?.message || 'Unknown error'}`
      await userClient.from('extracted_rows').update({ status: 'failed', error: msg }).eq('id', rowId)
      return json({ error: msg }, { status: 500, headers: corsHeaders })
    }

    const colsRaw = (table as any).columns as any[]
    const columns: Column[] = Array.isArray(colsRaw)
      ? colsRaw.map((c) => ({ key: String(c?.key ?? ''), desc: String(c?.desc ?? '') })).filter((c) => c.key)
      : []

    if (columns.length === 0) {
      await userClient.from('extracted_rows').update({ status: 'failed', error: 'Table schema has no columns' }).eq('id', rowId)
      return json({ status: 'failed', error: 'Table schema has no columns' } satisfies ExtractResponse, { headers: corsHeaders })
    }

    const prompt = buildExtractionPrompt(columns)
    const pdfUrl = signedUrlData.signedUrl

    let rawResponse = ''
    let extracted: Record<string, string | number | null> | null = null

    try {
      rawResponse =
        provider === 'gemini'
          ? await extractWithGemini(pdfUrl, prompt, `table-${tableId}-row-${rowId}`)
          : provider === 'openrouter'
            ? await extractWithOpenRouter(pdfUrl, prompt, `table-${tableId}-row-${rowId}`)
            : await extractWithChatPDF(pdfUrl, prompt)

      const parsed = sanitizeAndParseJSON(rawResponse)
      if (!parsed.success) {
        const truncated = truncateForStorage(rawResponse)
        await userClient
          .from('extracted_rows')
          .update({ status: 'failed', error: parsed.error, raw_response: truncated })
          .eq('id', rowId)
        return json({ status: 'failed', error: parsed.error } satisfies ExtractResponse, { headers: corsHeaders })
      }

      extracted = validateAndNormalize(parsed.data, columns)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown extraction error'
      await userClient
        .from('extracted_rows')
        .update({ status: 'failed', error: msg, raw_response: truncateForStorage(msg) })
        .eq('id', rowId)
      return json({ status: 'failed', error: msg } satisfies ExtractResponse, { headers: corsHeaders })
    }

    await userClient
      .from('extracted_rows')
      .update({
        status: 'extracted',
        data: extracted,
        error: null,
        raw_response: truncateForStorage(rawResponse),
      })
      .eq('id', rowId)

    return json({ status: 'extracted', data: extracted } satisfies ExtractResponse, { headers: corsHeaders })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return json({ error: msg }, { status: 500, headers: corsHeaders })
  }
})

