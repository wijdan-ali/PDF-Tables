'use client'

import { useMemo, useRef } from 'react'
import useSWR from 'swr'
import type { ExtractedRow } from '@/types/api'
import { Skeleton } from '@/components/ui/skeleton'

interface RecordsCardProps {
  tableId: string
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

// Grain (match UploadPanel/Sidebar feel)
const RECORDS_GRAIN_SCALE_PX = 40
const RECORDS_GRAIN_CONTRAST = 1.35
const RECORDS_GRAIN_BRIGHTNESS = 1.05

export default function RecordsCard({ tableId }: RecordsCardProps) {
  const rowsKey = useMemo(() => `/api/tables/${tableId}/rows`, [tableId])
  const { data: rows } = useSWR<ExtractedRow[]>(rowsKey, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  })

  const hasRows = Array.isArray(rows)
  const count = hasRows ? rows.length : null
  const cardRef = useRef<HTMLDivElement>(null)
  const spotRafRef = useRef<number | null>(null)

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
        <div
          className="absolute inset-0 opacity-[0.14] dark:opacity-0"
          style={{
            backgroundImage:
              `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat',
            backgroundSize: `${Math.max(8, RECORDS_GRAIN_SCALE_PX)}px ${Math.max(8, RECORDS_GRAIN_SCALE_PX)}px`,
            mixBlendMode: 'soft-light',
            filter: `contrast(${RECORDS_GRAIN_CONTRAST}) brightness(${RECORDS_GRAIN_BRIGHTNESS})`,
          }}
        />
        <div
          className="absolute inset-0 opacity-0 dark:opacity-[0.5]"
          style={{
            backgroundImage:
              `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat',
            backgroundSize: `${Math.max(8, RECORDS_GRAIN_SCALE_PX)}px ${Math.max(8, RECORDS_GRAIN_SCALE_PX)}px`,
            mixBlendMode: 'soft-light',
            filter: `contrast(${RECORDS_GRAIN_CONTRAST}) brightness(${RECORDS_GRAIN_BRIGHTNESS})`,
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 h-full px-6 flex flex-col justify-center items-start">
        <div className="font-serif text-[16px] font-bold tracking-wide">Number Of Records</div>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-3.5 w-3.5 rounded-full bg-foreground/15" />
          {count === null ? (
            <Skeleton className="h-10 w-24 rounded-xl" />
          ) : (
            <div className="text-[40px] leading-none font-bold">{count}</div>
          )}
        </div>
      </div>
    </div>
  )
}


