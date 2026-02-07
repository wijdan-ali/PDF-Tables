'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { useSWRConfig } from 'swr'
import { useRouter } from 'next/navigation'
import type { ExtractResponse, ExtractedRow } from '@/types/api'
import { createClient } from '@/lib/supabase/client'
import { TABLE_TOUCHED_EVENT } from '@/lib/constants/events'
import { AI_PROVIDER_STORAGE_KEY } from '@/lib/constants/storage'
import GrainOverlay from '@/components/GrainOverlay'

// Separate grain overlay (independent from Silk noise). Tweak freely.
const UPLOAD_GRAIN_OPACITY = 0.55
const UPLOAD_GRAIN_SCALE_PX = 40
const UPLOAD_GRAIN_CONTRAST = 1.4
const UPLOAD_GRAIN_BRIGHTNESS = 1.05

interface UploadPanelProps {
  tableId: string
  columnsCount?: number
  /**
   * When the table detail page is still bootstrapping (e.g. hard refresh),
   * render the full card but keep it non-interactive without showing errors.
   */
  isBootstrapping?: boolean
}

type UploadState = 'idle' | 'processing' | 'failed'

export default function UploadPanel({ tableId, columnsCount = 0, isBootstrapping = false }: UploadPanelProps) {
  const { mutate } = useSWRConfig()
  const router = useRouter()
  const [state, setState] = useState<UploadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)

  const rowsKey = `/api/tables/${tableId}/rows`
  const isBusy = useMemo(() => state === 'processing', [state])

  const { data: billingMe } = useSWR(
    '/api/billing/me',
    async (url: string) => {
      const res = await fetch(url)
      if (!res.ok) return null
      return (await res.json().catch(() => null)) as any
    },
    { revalidateOnFocus: false }
  )

  const batchEnabled = billingMe?.entitlement?.batch_enabled === true
  const tier = typeof billingMe?.entitlement?.tier === 'string' ? billingMe.entitlement.tier : null

  const shouldRouteToBilling = (msg: string) => {
    const m = (msg || '').toLowerCase()
    return m.includes('limit') || m.includes('upgrade') || m.includes('trial has ended') || m.includes('choose a plan')
  }

  const limitHint = useMemo(() => {
    if (!billingMe?.entitlement) return null
    if (tier === 'starter') {
      const used = Number(billingMe?.usage?.monthly?.docs_extracted ?? 0)
      const limit = Number(billingMe?.entitlement?.docs_limit_monthly ?? 200)
      const remaining = Math.max(0, limit - used)
      return `${remaining} of ${limit} documents remaining this month (Starter).`
    }
    if (tier === 'pro_trial') {
      const used = Number(billingMe?.usage?.trial?.docs_extracted ?? 0)
      const limit = Number(billingMe?.entitlement?.docs_limit_trial ?? 50)
      const remaining = Math.max(0, limit - used)
      return `${remaining} of ${limit} documents remaining in your 7-day trial.`
    }
    if (tier === 'pro') {
      return 'Unlimited documents (Professional).'
    }
    return null
  }, [billingMe, tier])

  // When switching tables, keep the card mounted (no flicker) but reset transient upload state.
  useEffect(() => {
    setState('idle')
    setError(null)
    if (inputRef.current) inputRef.current.value = ''

    // Reset spotlight to avoid "stuck" highlight after navigation.
    const el = cardRef.current
    if (el) {
      el.style.setProperty('--spot-o', '0')
    }
  }, [tableId])

  const isPdfFile = (f: File) => {
    const name = (f.name || '').toLowerCase()
    const byType = f.type === 'application/pdf'
    const byExt = name.endsWith('.pdf')
    return byType || byExt
  }

  const optimisticInsertRow = (newRow: ExtractedRow) => {
    void mutate(
      rowsKey,
      (prev?: ExtractedRow[]) => {
        const existing = Array.isArray(prev) ? prev : []
        const without = existing.filter((r) => r.id !== newRow.id)
        return [newRow, ...without]
      },
      { revalidate: false, populateCache: true }
    )
  }

  const optimisticUpdateRow = (targetRowId: string, patch: Partial<ExtractedRow>) => {
    void mutate(
      rowsKey,
      (prev?: ExtractedRow[]) => {
        const existing = Array.isArray(prev) ? prev : []
        return existing.map((r) => (r.id === targetRowId ? ({ ...r, ...patch } as ExtractedRow) : r))
      },
      { revalidate: false, populateCache: true }
    )
  }

  const getProvider = (): 'chatpdf' | 'gemini' => {
    try {
      const raw = localStorage.getItem(AI_PROVIDER_STORAGE_KEY)
      return raw === 'gemini' ? 'gemini' : 'chatpdf'
    } catch {
      return 'chatpdf'
    }
  }

  const handleExtract = async (targetRowId: string) => {
    const supabase = createClient()
    const { data: extractData, error: invokeError } = await supabase.functions.invoke<ExtractResponse>('extract-table', {
      body: { tableId, row_id: targetRowId, provider: getProvider() },
    })

    if (invokeError || !extractData) {
      throw new Error(invokeError?.message || 'Extraction failed')
    }
    if (extractData.status === 'failed') {
      throw new Error(extractData.error || 'Extraction failed')
    }
  }

  const markRowFailed = async (targetRowId: string, message: string) => {
    optimisticUpdateRow(targetRowId, { status: 'failed', error: message } as any)
    try {
      await fetch(`/api/rows/${targetRowId}/fail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: message }),
      })
    } catch {
      // best-effort
    }
  }

  type BatchInitResponse = {
    items?: Array<{ row_id: string; upload_url?: string; error?: string }>
  }

  const runPool = async <T,>(items: T[], limit: number, worker: (item: T, idx: number) => Promise<void>) => {
    let next = 0
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const idx = next++
        if (idx >= items.length) return
        await worker(items[idx], idx)
      }
    })
    await Promise.all(runners)
  }

  const startSingle = async (file: File) => {
    if (isBootstrapping) return
    if (isBusy) return
    if (tier === 'free') {
      router.push('/billing')
      return
    }

    if (columnsCount === 0) {
      setError('Please create at least one column before uploading a PDF. Click "Add Column" to get started.')
      setState('failed')
      return
    }

    if (!isPdfFile(file)) {
      setError('Only PDF files are supported')
      setState('failed')
      return
    }

    setState('processing')
    setError(null)

    // Touch table immediately so sidebar reorders right away.
    window.dispatchEvent(
      new CustomEvent(TABLE_TOUCHED_EVENT, {
        detail: { tableId, updated_at: new Date().toISOString() },
      })
    )

    const nowIso = new Date().toISOString()
    const nowOrder = Date.now() / 1000

    let rowId: string | null = null
    try {
      // Step 1: Create a row + get signed upload URL
      const initRes = await fetch(`/api/tables/${tableId}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ size: file.size, filename: file.name }),
      })
      const initPayload = (await initRes.json().catch(() => ({}))) as any
      if (!initRes.ok) throw new Error(initPayload?.error || 'Failed to initiate upload')

      rowId = typeof initPayload?.row_id === 'string' ? initPayload.row_id : null
      const uploadUrl = typeof initPayload?.upload_url === 'string' ? initPayload.upload_url : null
      if (!rowId || !uploadUrl) throw new Error('Unexpected upload response')

      optimisticInsertRow({
        id: rowId,
        table_id: tableId,
        data: {},
        is_verified: false,
        status: 'uploaded',
        row_order: nowOrder,
        created_at: nowIso,
        updated_at: nowIso,
      })

      const uploadResult = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': 'application/pdf' },
      })
      if (!uploadResult.ok) throw new Error('Failed to upload file to storage')

      await handleExtract(rowId)
      // Revalidate billing/usage so progress bars update immediately.
      void mutate('/api/billing/me')
      void mutate(rowsKey)
      setState('idle')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload/extraction failed'
      if (rowId) await markRowFailed(rowId, msg)
      setError(msg)
      setState('failed')
      if (shouldRouteToBilling(msg)) router.push('/settings?focus=billing')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const startBatch = async (files: File[]) => {
    if (isBootstrapping) return
    if (isBusy) return
    if (tier === 'free') {
      router.push('/billing')
      return
    }

    if (columnsCount === 0) {
      setError('Please create at least one column before uploading a PDF. Click \"Add Column\" to get started.')
      setState('failed')
      return
    }

    const pdfs = files.filter((f) => isPdfFile(f))
    if (pdfs.length === 0) {
      setError('Please select PDF files')
      setState('failed')
      return
    }

    // Batch upload is Professional-only. On Starter, fall back to single upload.
    if (!batchEnabled) {
      if (pdfs.length > 1) {
        setError('Batch upload is available on the Professional plan only. Uploading the first PDF instead.')
      }
      await startSingle(pdfs[0])
      return
    }

    setState('processing')
    setError(null)

    // Touch table immediately so sidebar reorders right away.
    window.dispatchEvent(
      new CustomEvent(TABLE_TOUCHED_EVENT, {
        detail: { tableId, updated_at: new Date().toISOString() },
      })
    )

    try {
      // Step 1: Create N rows and get N signed upload URLs
      const initRes = await fetch(`/api/tables/${tableId}/upload/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: pdfs.map((f) => ({ name: f.name, size: f.size })),
        }),
      })

      const initPayload = (await initRes.json().catch(() => ({}))) as BatchInitResponse & { error?: string }
      if (!initRes.ok) {
        throw new Error(initPayload?.error || 'Failed to initiate batch upload')
      }

      const items = Array.isArray(initPayload.items) ? initPayload.items : []
      if (items.length !== pdfs.length) {
        throw new Error('Unexpected batch upload response')
      }

      const nowIso = new Date().toISOString()
      const nowOrder = Date.now() / 1000
      // Optimistically insert all rows so the table renders them immediately.
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        optimisticInsertRow({
          id: it.row_id,
          table_id: tableId,
          data: {},
          is_verified: false,
          status: it.error ? 'failed' : 'uploaded',
          error: it.error,
          row_order: nowOrder + (items.length - i) / 1000,
          created_at: nowIso,
          updated_at: nowIso,
        })
      }

      const tasks = items
        .map((it, i) => ({ rowId: it.row_id, uploadUrl: it.upload_url, file: pdfs[i], initError: it.error }))
        .filter((t) => !t.initError && typeof t.uploadUrl === 'string' && t.uploadUrl.length > 0)

      let failedCount = items.filter((it) => it.error).length

      // Step 2+3: Upload each PDF, then trigger extraction immediately. Concurrency limit = 5.
      await runPool(tasks, 5, async (t) => {
        try {
          const uploadResult = await fetch(t.uploadUrl as string, {
            method: 'PUT',
            body: t.file,
            headers: { 'Content-Type': 'application/pdf' },
          })
          if (!uploadResult.ok) {
            throw new Error('Failed to upload file to storage')
          }

          await handleExtract(t.rowId)
          // Revalidate billing/usage so progress bars update immediately.
          void mutate('/api/billing/me')
        } catch (e) {
          failedCount += 1
          const msg = e instanceof Error ? e.message : 'Upload/extraction failed'
          await markRowFailed(t.rowId, msg)
          if (shouldRouteToBilling(msg)) router.push('/settings?focus=billing')
        } finally {
          // Keep UI responsive; SWR polling will reflect row state changes as they land.
          void mutate(rowsKey)
        }
      })

      // Final refresh
      void mutate(rowsKey)

      if (failedCount > 0) {
        setError(`Failed to process ${failedCount} file${failedCount === 1 ? '' : 's'}. See failed rows for details.`)
        setState('idle')
      } else {
        setState('idle')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Batch upload failed'
      setError(msg)
      setState('failed')
      if (shouldRouteToBilling(msg)) router.push('/settings?focus=billing')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : []
    e.currentTarget.value = ''
    void startBatch(list)
  }

  const reset = () => {
    setState('idle')
    setError(null)
  }

  return (
    <div className="space-y-3">
      {/* Upload card (token surface + spotlight) */}
      <div
        ref={cardRef}
        onMouseMove={(e) => {
          const el = cardRef.current
          if (!el) return
          const rect = el.getBoundingClientRect()
          const x = e.clientX - rect.left
          const y = e.clientY - rect.top
          if (rafRef.current) cancelAnimationFrame(rafRef.current)
          rafRef.current = requestAnimationFrame(() => {
            el.style.setProperty('--spot-x', `${x}px`)
            el.style.setProperty('--spot-y', `${y}px`)
            el.style.setProperty('--spot-o', '1')
          })
        }}
        onMouseLeave={() => {
          const el = cardRef.current
          if (!el) return
          el.style.setProperty('--spot-o', '0')
        }}
        onDragOver={(e) => {
          if (isBusy) return
          e.preventDefault()
        }}
        onDrop={(e) => {
          if (isBusy) return
          e.preventDefault()
          if (tier === 'free') {
            router.push('/billing')
            return
          }
          const list = Array.from(e.dataTransfer?.files ?? [])
          void startBatch(list)
        }}
        className={`relative w-[380px] h-[145px] max-w-full overflow-hidden rounded-[22px] border border-border bg-card text-card-foreground px-5 pt-6 pb-5 shadow-md ${
          isBusy
            ? 'opacity-60'
            : !isBootstrapping && columnsCount === 0
              ? 'cursor-not-allowed'
              : 'transition-[border-color,transform] duration-200 ease-out hover:border-ring/40'
        }`}
      >
        {/* Background layers */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Spotlight card effect (mouse-follow) */}
          <div
            className="absolute inset-0"
            style={{
              opacity: 'var(--spot-o, 0)',
              background:
                'radial-gradient(700px circle at var(--spot-x, 10%) var(--spot-y, 30%), color-mix(in oklch, var(--primary) 18%, transparent), transparent 32%)',
              transition: 'opacity 180ms ease-out',
            }}
          />
          {/* Extra grain layer ABOVE blur/spotlight (independent from Silk noise) */}
          <GrainOverlay
            opacity={UPLOAD_GRAIN_OPACITY}
            scalePx={UPLOAD_GRAIN_SCALE_PX}
            contrast={UPLOAD_GRAIN_CONTRAST}
            brightness={UPLOAD_GRAIN_BRIGHTNESS}
          />
        </div>

        {/* Foreground */}
        <div className="relative z-10 flex h-full flex-col justify-center items-start">
          <div className="space-y-2">
            <div className="font-serif font-bold text-[16px] tracking-medium">Upload file</div>
            <div className="text-[12px] text-muted-foreground">Upload a PDF to extract rows.</div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (isBootstrapping) return
              if (isBusy) return
              if (tier === 'free') {
                router.push('/billing')
                return
              }
              if (columnsCount === 0) {
                setError('Please create at least one column before uploading a PDF. Click "Add Column" to get started.')
                setState('failed')
                return
              }
              inputRef.current?.click()
            }}
            disabled={isBusy || isBootstrapping || columnsCount === 0}
            className="mt-4 self-start inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary text-primary-foreground px-3.5 py-2 text-[12px] font-medium transition-[transform,box-shadow,opacity,filter] duration-200 ease-out hover:-translate-y-[1px] hover:shadow-md hover:brightness-[1.03] active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {batchEnabled ? 'Choose PDF(s)' : 'Choose PDF'}
          </button>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple={batchEnabled}
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      </div>

      {state === 'failed' && (
        <div className="space-y-2">
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive">
            {error || 'An error occurred'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="px-4 py-2 border border-input rounded-xl hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Start Over
            </button>
          </div>
        </div>
      )}

      {error && state !== 'failed' && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  )
}

