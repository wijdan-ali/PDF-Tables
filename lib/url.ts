import { headers } from 'next/headers'

function trimTrailingSlash(u: string): string {
  return u.endsWith('/') ? u.slice(0, -1) : u
}

function normalizeBasePath(p: string): string {
  if (!p || p === '/') return ''
  const withLeading = p.startsWith('/') ? p : `/${p}`
  return withLeading.endsWith('/') ? withLeading.slice(0, -1) : withLeading
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

function getConfiguredBasePath(): string {
  const envBasePath = typeof process.env.NEXT_PUBLIC_BASE_PATH === 'string' ? process.env.NEXT_PUBLIC_BASE_PATH : ''
  if (envBasePath) return normalizeBasePath(envBasePath)

  const appUrl = typeof process.env.NEXT_PUBLIC_APP_URL === 'string' ? process.env.NEXT_PUBLIC_APP_URL : ''
  if (appUrl) {
    try {
      const parsed = new URL(appUrl)
      const parsedPath = normalizeBasePath(parsed.pathname)
      if (parsedPath) return parsedPath
    } catch {
      // ignore invalid url
    }
  }

  // Fallback to the app mount in next.config.js
  return '/app'
}

function getOriginOnlyFromEnv(appUrlEnv: string): string {
  try {
    const parsed = new URL(appUrlEnv)
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return ''
  }
}

export function getAppBaseUrl(): string {
  const envAppUrl = typeof process.env.NEXT_PUBLIC_APP_URL === 'string' ? trimTrailingSlash(process.env.NEXT_PUBLIC_APP_URL) : ''
  const envOrigin = envAppUrl ? getOriginOnlyFromEnv(envAppUrl) : ''
  const basePath = getConfiguredBasePath()

  const h = headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'http'

  if (host) {
    const derivedOrigin = `${proto}://${host}`
    const origin = !envOrigin || isLocalhostUrl(envOrigin) ? derivedOrigin : envOrigin
    return `${origin}${basePath}`
  }

  if (envOrigin) return `${envOrigin}${basePath}`
  return `http://localhost:3000${basePath}`
}

