function parseAllowedOrigins(raw: string | undefined | null): string[] {
  const v = (raw ?? '').trim()
  if (!v) return []
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function isAllowedOrigin(origin: string, allowed: string[]): boolean {
  if (!origin) return false
  // Exact match only (no wildcards); safer and predictable.
  return allowed.includes(origin)
}

/**
 * Builds CORS headers for a specific request.
 *
 * Configure with Edge Function env:
 * - ALLOWED_ORIGINS="https://app.example.com,https://staging.example.com,http://localhost:3000"
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allowedOrigins = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'))

  const allowOrigin = isAllowedOrigin(origin, allowedOrigins) ? origin : ''

  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // Important: required when echoing Access-Control-Allow-Origin dynamically
    Vary: 'Origin',
    'Access-Control-Max-Age': '86400',
  }

  if (allowOrigin) {
    headers['Access-Control-Allow-Origin'] = allowOrigin
  }

  return headers
}

