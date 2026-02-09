import { headers } from 'next/headers'

function trimTrailingSlash(u: string): string {
  return u.endsWith('/') ? u.slice(0, -1) : u
}

function isLocalhostUrl(u: string): boolean {
  try {
    const parsed = new URL(u)
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

/**
 * Returns the current request origin (scheme + host) when possible.
 * Falls back to NEXT_PUBLIC_APP_URL.
 *
 * Note: in local dev, request-derived origin is the safest (no port drift).
 */
export function getAppOrigin(): string {
  const env = typeof process.env.NEXT_PUBLIC_APP_URL === 'string' ? trimTrailingSlash(process.env.NEXT_PUBLIC_APP_URL) : ''

  // Prefer request-derived origin in dev and when env is localhost (ports tend to drift).
  const h = headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'http'
  if (host) {
    const derived = `${proto}://${host}`
    if (!env || isLocalhostUrl(env)) return derived
    return env
  }

  if (env) return env
  return 'http://localhost:3000'
}

