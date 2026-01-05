'use client'

import { useState, useEffect, useRef } from 'react'

// In-memory cache to avoid re-rendering thumbnails after they’ve been generated once.
// Keyed by stable PDF path (pathname), not the signed token.
const previewCache = new Map<string, { dataUrl?: string; error?: boolean }>()

interface PdfThumbnailCellProps {
  thumbnailUrl?: string
  pdfUrl?: string
  filename?: string
}

function base64UrlToString(input: string) {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  return atob(padded)
}

function getSignedUrlExpSeconds(url?: string): number | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const token = u.searchParams.get('token')
    if (!token) return null
    const parts = token.split('.')
    if (parts.length < 2) return null
    const payloadJson = base64UrlToString(parts[1])
    const payload = JSON.parse(payloadJson) as { exp?: number }
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

function getUrlPathname(url?: string): string | null {
  if (!url) return null
  try {
    return new URL(url).pathname
  } catch {
    return null
  }
}

function shouldSwapUrl(currentUrl: string | undefined, nextUrl: string | undefined, force: boolean) {
  if (!nextUrl) return false
  if (!currentUrl) return true
  if (force) return true
  if (currentUrl === nextUrl) return false

  const currentPath = getUrlPathname(currentUrl)
  const nextPath = getUrlPathname(nextUrl)
  if (currentPath && nextPath && currentPath !== nextPath) return true

  // If these are Supabase signed URLs, refresh only when current is near expiry.
  const now = Math.floor(Date.now() / 1000)
  const currentExp = getSignedUrlExpSeconds(currentUrl)
  const nextExp = getSignedUrlExpSeconds(nextUrl)
  if (currentExp && nextExp) {
    const refreshWindowSeconds = 10 * 60
    if (currentExp <= now + refreshWindowSeconds && nextExp > currentExp) return true
    return false
  }

  // Unknown token format; keep current to avoid constant reloads.
  return false
}

export default function PdfThumbnailCell({
  thumbnailUrl,
  pdfUrl,
  filename = 'document.pdf',
}: PdfThumbnailCellProps) {
  const [imageError, setImageError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [displayedThumbnailUrl, setDisplayedThumbnailUrl] = useState<string | undefined>(thumbnailUrl)
  const [renderedPreviewUrl, setRenderedPreviewUrl] = useState<string | null>(null)
  const renderAbortRef = useRef<AbortController | null>(null)

  const getStableKey = (url?: string) => {
    if (!url) return undefined
    try {
      return new URL(url).pathname
    } catch {
      return url
    }
  }

  const handleClick = () => {
    const url = pdfUrl
    if (url) {
      window.open(url, '_blank')
    }
  }

  useEffect(() => {
    const nextKey = getStableKey(thumbnailUrl)
    const currentKey = getStableKey(displayedThumbnailUrl)

    if (!thumbnailUrl) {
      setDisplayedThumbnailUrl(undefined)
      setIsLoading(false)
      setImageError(false)
      setRenderedPreviewUrl(null)
      return
    }

    // Only swap if the underlying file changed (path change), not just a new signed token.
    if (!displayedThumbnailUrl || nextKey !== currentKey) {
      setDisplayedThumbnailUrl(thumbnailUrl)
      setIsLoading(true)
      setImageError(false)
    }
  }, [thumbnailUrl, displayedThumbnailUrl, imageError])

  // Client-side PDF render fallback (first page) using pdfjs-dist to avoid iframe flicker.
  useEffect(() => {
    // Only recompute preview when the underlying file path changes or we have no thumbnail
    const thumbKey = getStableKey(displayedThumbnailUrl)
    const pdfKey = getStableKey(pdfUrl)

    // If we already rendered this PDF before, hydrate from cache and skip work.
    if (!displayedThumbnailUrl && pdfKey && previewCache.has(pdfKey)) {
      const cached = previewCache.get(pdfKey)
      setRenderedPreviewUrl(cached?.dataUrl ?? null)
      setImageError(!!cached?.error)
      setIsLoading(false)
      return
    }

    if (thumbKey && thumbKey === pdfKey) return

    if (displayedThumbnailUrl || imageError || !pdfUrl) {
      setRenderedPreviewUrl(null)
      if (renderAbortRef.current) {
        renderAbortRef.current.abort()
        renderAbortRef.current = null
      }
      return
    }

    const controller = new AbortController()
    renderAbortRef.current = controller
    setIsLoading(true)

    const renderPdf = async () => {
      try {
        // Use legacy build for better webpack compatibility.
        const [{ getDocument, GlobalWorkerOptions }, workerModule] = await Promise.all([
          import('pdfjs-dist/legacy/build/pdf'),
          import('pdfjs-dist/legacy/build/pdf.worker.min.mjs'),
        ])

        // pdfjs worker import is handled as an emitted asset (see next.config.js).
        // Normalize to a string URL (either direct string or default export).
        const workerSrc =
          typeof workerModule === 'string'
            ? workerModule
            : typeof (workerModule as any).default === 'string'
              ? (workerModule as any).default
              : null

        if (!workerSrc) {
          throw new Error('Unable to resolve pdfjs worker URL')
        }

        GlobalWorkerOptions.workerSrc = workerSrc

        // Fetch PDF as ArrayBuffer to avoid CORS/credential issues with signed URLs.
        const fetchTimeout = setTimeout(() => controller.abort(), 6000)
        const pdfResp = await fetch(pdfUrl, { signal: controller.signal })
        if (controller.signal.aborted) return
        clearTimeout(fetchTimeout)
        if (!pdfResp.ok) {
          throw new Error(`PDF fetch failed (${pdfResp.status})`)
        }
        const pdfArrayBuffer = await pdfResp.arrayBuffer()
        if (controller.signal.aborted) return

        const task = getDocument({
          data: pdfArrayBuffer,
          disableStream: true, // avoid partial loads that can fail on short-lived signed URLs
          useSystemFonts: true,
        })
        const pdf = await task.promise
        if (controller.signal.aborted) return
        const page = await pdf.getPage(1)
        if (controller.signal.aborted) return
        const viewport = page.getViewport({ scale: 0.8 })
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas not supported')
        canvas.width = viewport.width
        canvas.height = viewport.height
        const renderTask = page.render({ canvasContext: context, viewport })
        await renderTask.promise
        if (controller.signal.aborted) return
        const dataUrl = canvas.toDataURL('image/png')
        setRenderedPreviewUrl(dataUrl)
        // Cache for future renders (keyed by PDF path)
        if (pdfKey) {
          previewCache.set(pdfKey, { dataUrl })
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('PDF render failed', err)
          setRenderedPreviewUrl(null)
          setImageError(true)
          if (pdfKey) {
            previewCache.set(pdfKey, { error: true })
          }
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
  }
      }
    }

    void renderPdf()

    return () => {
      controller.abort()
      renderAbortRef.current = null
    }
  }, [displayedThumbnailUrl, imageError, pdfUrl])

  const thumbForPreview = displayedThumbnailUrl || renderedPreviewUrl

  // Fallback: stable PDF icon
  if (!thumbForPreview || imageError) {
    return (
      <div
        onClick={handleClick}
        className="w-24 h-24 flex items-center justify-center bg-gray-100 border border-gray-200 rounded cursor-pointer hover:bg-gray-200 transition-colors"
        title={filename}
      >
        <svg
          className="w-8 h-8 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        </svg>
      </div>
    )
  }

  return (
    <div
      onClick={handleClick}
      className="w-24 h-24 relative border border-gray-200 rounded overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
      title={filename}
    >
      {isLoading && (
        <div className="absolute inset-0 bg-gray-100 animate-pulse flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
        </div>
      )}
      <img
        src={thumbForPreview}
        alt={filename}
        className={`w-full h-full object-cover ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setImageError(true)
          setIsLoading(false)
        }}
      />
    </div>
  )
}



