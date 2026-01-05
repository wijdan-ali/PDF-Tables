'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import dynamic from 'next/dynamic'
import { junicode } from '@/app/fonts'
import type { ExtractedRow } from '@/types/api'

const Silk = dynamic(() => import('@/components/Silk/Silk'), { ssr: false })

interface RecordsCardProps {
  tableId: string
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

// Visual tuning (match your existing “silk” look)
const SILK_PROPS = {
  speed: 2.0,
  scale: 0.6,
  color: '#5B6180',
  noiseIntensity: 1.2,
  rotation: 1.9,
} as const

export default function RecordsCard({ tableId }: RecordsCardProps) {
  const rowsKey = useMemo(() => `/api/tables/${tableId}/rows`, [tableId])
  const { data: rows } = useSWR<ExtractedRow[]>(rowsKey, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    keepPreviousData: true,
  })

  const hasRows = Array.isArray(rows)
  const target = hasRows ? rows.length : null
  const [display, setDisplay] = useState(0)
  const displayRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const spotRafRef = useRef<number | null>(null)

  useEffect(() => {
    displayRef.current = display
  }, [display])

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    // If we don't have fresh rows yet (during navigation/loading), keep previous display (no flicker).
    if (target === null) return

    // If the table truly has 0 rows, show 0 (no animation).
    if (target === 0) {
      setDisplay(0)
      return
    }

    const startValue = displayRef.current
    const endValue = target
    const durationMs = 650
    const jitterPhase = 0.35 // % of duration with "flicker"
    const start = performance.now()

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)

      // Smooth ease in/out (cubic)
      const easeInOutCubic = (x: number) =>
        x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2

      const eased = easeInOutCubic(t)
      const base = startValue + (endValue - startValue) * eased

      // Add a decaying jitter early (no "glitch to 0")
      let value = base
      if (t < jitterPhase) {
        const k = 1 - t / jitterPhase // 1 → 0
        const amp = Math.max(1, Math.round(Math.abs(endValue - startValue) * 0.18))
        const jitter = (Math.random() * 2 - 1) * amp * k
        value = base + jitter
      }

      // Clamp and commit
      const next = Math.max(0, Math.min(endValue, Math.round(value)))
      setDisplay(next)

      if (t >= 1) {
        setDisplay(endValue)
        return
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [target]) // animate only when the resolved count changes (avoids restarting on navigation while loading)

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
      className="relative w-[380px] h-[145px] max-w-full rounded-[22px] overflow-hidden shadow-[0_14px_26px_rgba(0,0,0,0.14)]"
    >
      {/* Silky border ring */}
      <div className="absolute inset-0 pointer-events-none">
        <Silk {...SILK_PROPS} />
        <div className="absolute inset-0 bg-white/[0.02] backdrop-blur-[30px] backdrop-saturate-[1.15]" />
      </div>

      {/* Inner surface (creates the “border only” effect) */}
      <div className="absolute inset-[6px] rounded-[18px] bg-white" />

      {/* Spotlight OVER the white surface (mouse-follow) */}
      <div
        className="pointer-events-none absolute inset-[6px] rounded-[18px]"
        style={{
          opacity: 'var(--spot-o, 0)',
          background:
            'radial-gradient(220px circle at var(--spot-x, 35%) var(--spot-y, 35%), rgba(131, 129, 166, 0.2), transparent 80%)',
          mixBlendMode: 'multiply',
          transition: 'opacity 180ms ease-out',
        }}
      />

      {/* Content */}
      <div className="relative z-10 h-full px-6 text-[#0b1220] flex flex-col justify-center items-start">
        <div className={`${junicode.className} text-[16px] font-bold tracking-wide`}>Number Of Records</div>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-3.5 w-3.5 rounded-full bg-black/15" />
          <div className="text-[40px] leading-none font-bold">{display}</div>
        </div>
      </div>
    </div>
  )
}


