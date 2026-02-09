'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import type { ExtractedRow } from '@/types/api'
import GrainOverlay from '@/components/GrainOverlay'
import { apiPath } from '@/lib/api'

interface RecordsCardProps {
  tableId: string
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

// Grain (match UploadPanel/Sidebar feel)
const RECORDS_GRAIN_SCALE_PX = 40
const RECORDS_GRAIN_CONTRAST = 1.35
const RECORDS_GRAIN_BRIGHTNESS = 1.05

export default function RecordsCard({ tableId }: RecordsCardProps) {
  const rowsKey = useMemo(() => apiPath(`/api/tables/${tableId}/rows`), [tableId])
  const { data: rows } = useSWR<ExtractedRow[]>(rowsKey, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  })

  const hasRows = Array.isArray(rows)
  const count = hasRows ? rows.length : null
  const [hasResolvedCount, setHasResolvedCount] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const spotRafRef = useRef<number | null>(null)

  useEffect(() => {
    if (count !== null) setHasResolvedCount(true)
  }, [count])

  return (
    <div
      ref={cardRef}
      onMouseMove={(e) => {
        const el = cardRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        if (spotRafRef.current) cancelAnimationFrame(spotRafRef.current)
        spotRafRef.current = requestAnimationFrame(() => {
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
      className="relative w-[380px] h-[145px] max-w-full rounded-[22px] overflow-hidden border border-border bg-card text-card-foreground shadow-md transition-[border-color,transform] duration-200 ease-out hover:border-ring/40"
    >
      {/* Background layers */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Spotlight (mouse-follow) */}
        <div
          className="absolute inset-0"
          style={{
            opacity: 'var(--spot-o, 0)',
            background:
              'radial-gradient(260px circle at var(--spot-x, 35%) var(--spot-y, 35%), color-mix(in oklch, var(--primary) 18%, transparent), transparent 78%)',
            transition: 'opacity 180ms ease-out',
          }}
        />

        {/* Grain: subtle in light, stronger in dark */}
        <GrainOverlay
          opacity={0.14}
          darkOpacity={0.5}
          scalePx={RECORDS_GRAIN_SCALE_PX}
          contrast={RECORDS_GRAIN_CONTRAST}
          brightness={RECORDS_GRAIN_BRIGHTNESS}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 h-full px-6 flex flex-col justify-center items-start">
        <div className="font-serif text-[16px] font-bold tracking-medium">Number Of Records</div>

        <div className="mt-6 flex items-center gap-3">
          <div className="h-3.5 w-3.5 rounded-full bg-foreground/15" />
          {count === null ? (
            // Reserve exact space; no skeleton (prevents layout jump).
            <div className="h-[40px] w-24" />
          ) : (
            <div
              key={hasResolvedCount ? String(count) : 'count'}
              className="text-[40px] leading-none font-bold animate-in fade-in slide-in-from-bottom-1 duration-200"
            >
              {count}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


