function normalizeBasePath(value?: string): string {
  if (!value) return ''
  if (value === '/') return ''
  return value.startsWith('/') ? value.replace(/\/$/, '') : `/${value.replace(/\/$/, '')}`
}

export function getBasePath(): string {
  const envBasePath = process.env.NEXT_PUBLIC_BASE_PATH
  if (envBasePath) return normalizeBasePath(envBasePath)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl) {
    try {
      const parsed = new URL(appUrl)
      return normalizeBasePath(parsed.pathname)
    } catch {
      // Ignore invalid URL, fall back below.
    }
  }

  return '/app'
}

export function apiPath(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const basePath = getBasePath()
  return basePath ? `${basePath}${normalizedPath}` : normalizedPath
}
