'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { junicode } from '@/app/fonts'
import dynamic from 'next/dynamic'
import { useRef } from 'react'

const Silk = dynamic(() => import('@/components/Silk/Silk'), { ssr: false })

interface Table {
  id: string
  table_name: string
  updated_at: string
}

const TABLE_NAME_UPDATED_EVENT = 'pdf-tables:table-name-updated'
const TABLE_TOUCHED_EVENT = 'pdf-tables:table-touched'
const SIDEBAR_TABLES_CACHE_KEY = 'pdf-tables:sidebar-tables-cache'

// Tune these to control the extra grain layer (separate from Silk's noiseIntensity).
const SIDEBAR_GRAIN_OPACITY = 1.0
// Size of the grain tile in px (larger = chunkier grain, smaller = finer grain)
const SIDEBAR_GRAIN_SCALE_PX = 40
// Visual strength (higher = harsher grain)
const SIDEBAR_GRAIN_CONTRAST = 1.0
const SIDEBAR_GRAIN_BRIGHTNESS = 1.0

function readTablesCache(): Table[] {
  try {
    const raw = sessionStorage.getItem(SIDEBAR_TABLES_CACHE_KEY)
    if (!raw) return []
    const cached = JSON.parse(raw)
    if (!Array.isArray(cached)) return []
    // Ensure ordering is always updated_at desc
    return cached
      .filter(Boolean)
      .sort((a: Table, b: Table) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0))
  } catch {
    return []
  }
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [tables, setTables] = useState<Table[]>(() => (typeof window === 'undefined' ? [] : readTablesCache()))
  const [loading, setLoading] = useState<boolean>(() =>
    typeof window === 'undefined' ? true : readTablesCache().length === 0
  )
  const shellRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const fetchTables = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/login')
        return
      }

      const { data, error } = await supabase
        .from('user_tables')
        .select('id, table_name, updated_at')
        .order('updated_at', { ascending: false })

      if (!error && data) {
        setTables(data)
      }
      setLoading(false)
    }

    fetchTables()
  }, [router])

  // Keep cache in sync with the latest in-memory ordering to avoid flicker on route transitions.
  // Important: don't overwrite cache with an empty list on mount.
  useEffect(() => {
    if (!tables.length) return
    try {
      sessionStorage.setItem(SIDEBAR_TABLES_CACHE_KEY, JSON.stringify(tables))
    } catch {
      // ignore
    }
  }, [tables])

  useEffect(() => {
    const onNameUpdated = (evt: Event) => {
      const e = evt as CustomEvent<{ tableId: string; table_name: string; updated_at?: string }>
      const { tableId, table_name, updated_at } = e.detail || ({} as any)
      if (!tableId || typeof table_name !== 'string') return

      setTables((prev) => {
        const next = prev.map((t) =>
          t.id === tableId
            ? { ...t, table_name, updated_at: updated_at ?? new Date().toISOString() }
            : t
        )
        // Keep ordering consistent with query: updated_at desc
        next.sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0))
        return next
      })
    }

    window.addEventListener(TABLE_NAME_UPDATED_EVENT, onNameUpdated as EventListener)
    return () => window.removeEventListener(TABLE_NAME_UPDATED_EVENT, onNameUpdated as EventListener)
  }, [])

  useEffect(() => {
    const onTouched = (evt: Event) => {
      const e = evt as CustomEvent<{ tableId: string; updated_at?: string }>
      const { tableId, updated_at } = e.detail || ({} as any)
      if (!tableId) return

      setTables((prev) => {
        const nextUpdatedAt = updated_at ?? new Date().toISOString()
        const next = prev.map((t) => (t.id === tableId ? { ...t, updated_at: nextUpdatedAt } : t))
        next.sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0))
        return next
      })
    }

    window.addEventListener(TABLE_TOUCHED_EVENT, onTouched as EventListener)
    return () => window.removeEventListener(TABLE_TOUCHED_EVENT, onTouched as EventListener)
  }, [])

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-80 z-50">
      <div
        ref={shellRef}
        onMouseMove={(e) => {
          const el = shellRef.current
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
          const el = shellRef.current
          if (!el) return
          el.style.setProperty('--spot-o', '0')
        }}
        className="relative h-full overflow-hidden rounded-tr-[28px] rounded-br-[28px]"
      >
        {/* Background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-tr-[28px] rounded-br-[28px]">
          <Silk speed={2.0} scale={0.6} color="#5B6180" noiseIntensity={1.2} rotation={1.9} />
          {/* Glass blur layer over Silk */}
          <div className="absolute inset-0 rounded-tr-[28px] rounded-br-[28px] bg-white/[0.02] backdrop-blur-[45px] backdrop-saturate-[1.25]" />
          {/* Spotlight card effect (mouse-follow) */}
          <div
            className="absolute inset-0 rounded-tr-[28px] rounded-br-[28px]"
            style={{
              opacity: 'var(--spot-o, 0)',
              background:
                'radial-gradient(300px circle at var(--spot-x, 50%) var(--spot-y, 20%), rgba(105, 104, 104, 0.16), transparent 55%)',
              transition: 'opacity 180ms ease-out',
            }}
          />
          {/* Extra grain layer ABOVE blur (tweak SIDEBAR_GRAIN_* constants) */}
          <div
            className="absolute inset-0 rounded-tr-[28px] rounded-br-[28px]"
            style={{
              opacity: SIDEBAR_GRAIN_OPACITY,
              // Real noise via SVG turbulence (stronger + more natural than repeating lines)
              backgroundImage:
                `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'repeat',
              backgroundSize: `${Math.max(8, SIDEBAR_GRAIN_SCALE_PX)}px ${Math.max(8, SIDEBAR_GRAIN_SCALE_PX)}px`,
              mixBlendMode: 'soft-light',
              filter: `contrast(${SIDEBAR_GRAIN_CONTRAST}) brightness(${SIDEBAR_GRAIN_BRIGHTNESS})`,
            }}
          />
        </div>

        {/* Right edge lines (no gap): outer border + inner highlight */}
        <div className="pointer-events-none absolute z-30 inset-y-0 right-0 w-px bg-white/15" />
        <div className="pointer-events-none absolute z-30 inset-y-6 right-[1px] w-px bg-gradient-to-b from-transparent via-white/60 to-transparent opacity-95" />

        {/* Foreground */}
        <div className="relative z-10 flex h-full flex-col px-5 pt-10 pb-5 text-white">
          <div className="pb-4">
            <Link
              href="/tables"
              className={`${junicode.className} text-[25px] leading-none font-normal tracking-tight text-white/95 hover:text-white transition-colors`}
            >
              PDF Tables
            </Link>
            {/* Divider */}
            <div className="mt-5 h-px w-full bg-gradient-to-r from-transparent from-[0.1px] via-white/50 to-transparent to-[calc(100%-0.1px)]" />
          </div>

          <div className="pt-2 pb-5">
            <Link
              href="/tables/new"
              className="group flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-[15px] font-medium text-white/90 transition-[background-color,border-color,transform,box-shadow] duration-200 ease-out hover:bg-white/14 hover:border-white/25 hover:-translate-y-[1px] hover:shadow-[0_10px_24px_rgba(0,0,0,0.25)] active:translate-y-0 active:bg-white/12"
            >
              <span className="text-lg leading-none text-white/90 transition-transform duration-200 ease-out group-hover:scale-[1.02]">
                +
              </span>
              <span>New Table</span>
            </Link>
          </div>

          <div className="flex-1 min-h-0">
            <div className="px-1 pb-2 text-[13px] font-semibold tracking-[0.18em] text-[#B1C2E4]">
              TABLES
            </div>

            <div className="h-full overflow-y-auto pr-1">
              {/* Only show Loading when we truly have no cached tables */}
              {loading && tables.length === 0 ? (
                <div className="px-2 py-2 text-sm text-white/70">Loading...</div>
              ) : tables.length === 0 ? (
                <div className="px-2 py-2 text-sm text-white/70">No tables yet</div>
              ) : (
                <div className="space-y-1.5">
                  {tables.map((table) => {
                    const isActive = pathname === `/tables/${table.id}`
                    return (
                      <Link
                        key={table.id}
                        href={`/tables/${table.id}`}
                        className={[
                          'block rounded-xl px-4 py-2.5 text-[15px] leading-snug transition-[background-color,border-color,transform,box-shadow,color] duration-200 ease-out',
                          'border border-transparent text-white/85',
                          isActive
                            ? 'bg-white/12 border-white/20 text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                            : 'hover:bg-white/8 hover:text-white/95 hover:-translate-y-[1px]',
                        ].join(' ')}
                      >
                        {table.table_name}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

