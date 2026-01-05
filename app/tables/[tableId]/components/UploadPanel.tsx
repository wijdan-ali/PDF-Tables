'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { useSWRConfig } from 'swr'
import type { UploadResponse, ExtractResponse } from '@/types/api'
import type { ExtractedRow } from '@/types/api'
import dynamic from 'next/dynamic'
import { junicode } from '@/app/fonts'

const Silk = dynamic(() => import('@/components/Silk/Silk'), { ssr: false })

// Separate grain overlay (independent from Silk noise). Tweak freely.
const UPLOAD_GRAIN_OPACITY = 0.55
const UPLOAD_GRAIN_SCALE_PX = 40
const UPLOAD_GRAIN_CONTRAST = 1.4
const UPLOAD_GRAIN_BRIGHTNESS = 1.05

interface UploadPanelProps {
  tableId: string
  columnsCount?: number
}

type UploadState = 'idle' | 'uploading' | 'extracting' | 'failed'

export default function UploadPanel({ tableId, columnsCount = 0 }: UploadPanelProps) {
  const { mutate } = useSWRConfig()
  const [file, setFile] = useState<File | null>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [rowId, setRowId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)

  const rowsKey = `/api/tables/${tableId}/rows`
  const fetcher = (url: string) => fetch(url).then((res) => res.json())
  const { data: rows } = useSWR<ExtractedRow[]>(rowsKey, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  })

  // When switching tables, keep the card mounted (no flicker) but reset transient upload state.
  useEffect(() => {
    setFile(null)
    setState('idle')
    setRowId(null)
    setError(null)
    setProgress(0)
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

  // Safety net: if the row reaches extracted/failed via polling in the grid, stop the spinner here too.
  useEffect(() => {
    if (state !== 'extracting' || !rowId || !rows) return
    const r = rows.find((x) => x.id === rowId)
    if (!r) return
    if (r.status === 'extracted') {
      setState('idle')
      setFile(null)
      setRowId(null)
      setProgress(0)
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    if (r.status === 'failed') {
      setError(r.error || 'Extraction failed')
      setState('failed')
    }
  }, [rows, rowId, state])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (columnsCount === 0) {
      // Safety: if somehow a file gets selected while columns are 0, reject it.
      e.currentTarget.value = ''
      setFile(null)
      setError('Please create at least one column before uploading a PDF. Click "Add Column" to get started.')
      setState('failed')
      return
    }

    const selectedFile = e.target.files?.[0]
    if (selectedFile && isPdfFile(selectedFile)) {
      setFile(selectedFile)
      setError(null)
      // Auto-start upload + extraction immediately
      void handleUpload(selectedFile)
    } else {
      setError('Please select a PDF file')
    }
  }

  const handleUpload = async (selected?: File) => {
    const activeFile = selected ?? file
    if (!activeFile) return

    // Validate columns exist before upload
    if (columnsCount === 0) {
      setError('Please create at least one column before uploading a PDF. Click "Add Column" to get started.')
      setState('failed')
      return
    }

    if (!isPdfFile(activeFile)) {
      setError('Only PDF files are supported.')
      setState('failed')
      return
    }

    setState('uploading')
    setError(null)
    setProgress(0)

    try {
      // Touch table immediately so sidebar reorders right away.
      window.dispatchEvent(
        new CustomEvent('pdf-tables:table-touched', {
          detail: { tableId, updated_at: new Date().toISOString() },
        })
      )

      // Step 1: Create row and get upload URL
      const uploadResponse = await fetch(`/api/tables/${tableId}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: activeFile.name,
          size: activeFile.size,
        }),
      })

      if (!uploadResponse.ok) {
        const data = await uploadResponse.json()
        throw new Error(data.error || 'Failed to initiate upload')
      }

      const uploadData: UploadResponse = await uploadResponse.json()
      setRowId(uploadData.row_id)
      setProgress(50)

      // Optimistically insert a loading row into the table (no full refresh)
      const now = new Date().toISOString()
      optimisticInsertRow({
        id: uploadData.row_id,
        table_id: tableId,
        data: {},
        is_verified: false,
        status: 'uploaded',
        created_at: now,
        updated_at: now,
      })

      // Step 2: Upload file to Storage (if signed URL provided)
      if (uploadData.upload_url) {
        const uploadResult = await fetch(uploadData.upload_url, {
          method: 'PUT',
          body: activeFile,
          headers: {
            'Content-Type': 'application/pdf',
          },
        })

        if (!uploadResult.ok) {
          throw new Error('Failed to upload file to storage')
        }
      } else {
        // Server-side upload: send file directly
        const formData = new FormData()
        formData.append('file', activeFile)
        formData.append('row_id', uploadData.row_id)

        const serverUploadResponse = await fetch(`/api/tables/${tableId}/upload`, {
          method: 'POST',
          body: formData,
        })

        if (!serverUploadResponse.ok) {
          throw new Error('Failed to upload file')
        }
      }

      setProgress(100)

      // Step 3: Trigger extraction
      await handleExtract(uploadData.row_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setState('failed')
    }
  }

  const handleExtract = async (targetRowId: string) => {
    setState('extracting')
    setError(null)

    try {
      window.dispatchEvent(
        new CustomEvent('pdf-tables:table-touched', {
          detail: { tableId, updated_at: new Date().toISOString() },
        })
      )

      const response = await fetch(`/api/tables/${tableId}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row_id: targetRowId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Extraction failed')
      }

      const extractData: ExtractResponse = await response.json()

      if (extractData.status === 'failed') {
        setError(extractData.error || 'Extraction failed')
        setState('failed')
        return
      }

      if (extractData.status === 'extracted') {
        // Extraction finished successfully — clear local loading UI
        setState('idle')
        setFile(null)
        setRowId(null)
        setProgress(0)
        if (inputRef.current) inputRef.current.value = ''
        void mutate(rowsKey)
        return
      } else {
        // Keep showing extracting state; grid will poll until the row becomes extracted/failed
      }

      // Revalidate rows once extraction API responds (keeps UI dynamic, no full refresh)
      void mutate(rowsKey)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed')
      setState('failed')
    }
  }

  const handleRetry = () => {
    if (rowId) {
      handleExtract(rowId)
    } else {
      handleUpload()
    }
  }

  const reset = () => {
    setFile(null)
    setState('idle')
    setRowId(null)
    setError(null)
    setProgress(0)
  }

  return (
    <div className="space-y-3">
      {/* Upload card (Silk background + spotlight) */}
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
        className={`relative w-[380px] h-[145px] max-w-full overflow-hidden rounded-[22px] border border-white/12 ring-1 ring-inset ring-white/12 px-5 pt-6 pb-5 text-white shadow-[0_14px_26px_rgba(0,0,0,0.14)] ${
          state === 'uploading' || state === 'extracting'
            ? 'opacity-60'
            : columnsCount === 0
              ? 'cursor-not-allowed'
              : 'transition-[border-color,transform] duration-200 ease-out hover:border-white/25'
        }`}
      >
        {/* Background layers */}
        <div className="absolute inset-0 pointer-events-none">
          <Silk speed={2.0} scale={0.6} color="#5B6180" noiseIntensity={1.2} rotation={1.9} />
          {/* Soft glass blur over Silk */}
          <div className="absolute inset-0 bg-white/[0.02] backdrop-blur-[36px] backdrop-saturate-[1.15]" />
          {/* Spotlight card effect (mouse-follow) */}
          <div
            className="absolute inset-0"
            style={{
              opacity: 'var(--spot-o, 0)',
              background:
                'radial-gradient(700px circle at var(--spot-x, 10%) var(--spot-y, 30%), rgba(100, 99, 99, 0.18), transparent 30%)',
              transition: 'opacity 180ms ease-out',
            }}
          />
          {/* Extra grain layer ABOVE blur/spotlight (independent from Silk noise) */}
          <div
            className="absolute inset-0"
            style={{
              opacity: UPLOAD_GRAIN_OPACITY,
              backgroundImage:
                `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'repeat',
              backgroundSize: `${Math.max(8, UPLOAD_GRAIN_SCALE_PX)}px ${Math.max(8, UPLOAD_GRAIN_SCALE_PX)}px`,
              mixBlendMode: 'soft-light',
              filter: `contrast(${UPLOAD_GRAIN_CONTRAST}) brightness(${UPLOAD_GRAIN_BRIGHTNESS})`,
            }}
          />
        </div>

        {/* Foreground */}
        <div className="relative z-10 flex h-full flex-col justify-center items-start">
          <div className="space-y-2">
            <div className={`${junicode.className} text-[16px] text-white/95 tracking-wide"`}>Upload file</div>
            <div className="text-[12px] text-white/70">Upload a PDF to extract rows.</div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (columnsCount === 0) {
                setError('Please create at least one column before uploading a PDF. Click "Add Column" to get started.')
                setState('failed')
                return
              }
              inputRef.current?.click()
            }}
            disabled={state === 'uploading' || state === 'extracting' || columnsCount === 0}
            className="mt-4 self-start inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3.5 py-2 text-[12px] font-medium text-white/90 transition-[background-color,border-color,transform,box-shadow,opacity] duration-200 ease-out hover:bg-white/14 hover:border-white/25 hover:-translate-y-[1px] hover:shadow-[0_10px_24px_rgba(0,0,0,0.22)] active:translate-y-0 active:bg-white/12 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Choose PDF
          </button>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      </div>

      {(state === 'uploading' || state === 'extracting') && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <span className="text-sm text-gray-600">
              {state === 'uploading' ? 'Uploading...' : 'Extracting data...'}
            </span>
          </div>
          {state === 'uploading' && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          )}
        </div>
      )}

      {state === 'failed' && (
        <div className="space-y-2">
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
            {error || 'An error occurred'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRetry}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
            <button
              onClick={reset}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Start Over
            </button>
          </div>
        </div>
      )}

      {error && state !== 'failed' && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}
    </div>
  )
}

