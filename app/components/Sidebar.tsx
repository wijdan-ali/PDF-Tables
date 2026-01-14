'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ThemeToggle } from '@/components/theme-toggle'
import { MoreHorizontal, Plus } from 'lucide-react'
import { PanelLeftClose } from 'lucide-react'
import ConfirmDialog from '@/app/components/ConfirmDialog'
import RenameTableModal from '@/app/components/RenameTableModal'
import { Pencil, Trash2 } from 'lucide-react'

interface Table {
  id: string
  table_name: string
  updated_at: string
}

interface SidebarProps {
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

const TABLE_NAME_UPDATED_EVENT = 'pdf-tables:table-name-updated'
const TABLE_TOUCHED_EVENT = 'pdf-tables:table-touched'
const TABLE_CREATED_EVENT = 'pdf-tables:table-created'
const TABLE_DELETED_EVENT = 'pdf-tables:table-deleted'
const SIDEBAR_TABLES_CACHE_KEY = 'pdf-tables:sidebar-tables-cache'
const AI_PROVIDER_STORAGE_KEY = 'pdf-tables:ai-provider'
type AiProvider = 'chatpdf' | 'gemini'

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

function writeTablesCache(next: Table[]) {
  try {
    sessionStorage.setItem(SIDEBAR_TABLES_CACHE_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

export default function Sidebar({ collapsed = false, onToggleCollapsed }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [tables, setTables] = useState<Table[]>(() => (typeof window === 'undefined' ? [] : readTablesCache()))
  const [loading, setLoading] = useState<boolean>(() =>
    typeof window === 'undefined' ? true : readTablesCache().length === 0
  )
  const [aiProvider, setAiProvider] = useState<AiProvider>(() => {
    if (typeof window === 'undefined') return 'chatpdf'
    try {
      const raw = localStorage.getItem(AI_PROVIDER_STORAGE_KEY)
      return raw === 'gemini' ? 'gemini' : 'chatpdf'
    } catch {
      return 'chatpdf'
    }
  })
  const [userId, setUserId] = useState<string | null>(null)
  const didInitAiProviderRef = useRef(false)
  const [openMenu, setOpenMenu] = useState<{ tableId: string; left: number; top: number } | null>(null)
  const [confirmDeleteTableId, setConfirmDeleteTableId] = useState<string | null>(null)
  const [renameTableId, setRenameTableId] = useState<string | null>(null)
  const [isDeletingTable, setIsDeletingTable] = useState(false)
  const shellRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const didHydrateFromServerRef = useRef(false)

  useEffect(() => {
    try {
      localStorage.setItem(AI_PROVIDER_STORAGE_KEY, aiProvider)
    } catch {
      // ignore
    }
  }, [aiProvider])

  // Keep AI provider synced to DB (fallback remains localStorage for resiliency).
  useEffect(() => {
    if (!didInitAiProviderRef.current) return
    if (!userId) return

    const supabase = createClient()
    void supabase.from('user_settings').upsert(
      { user_id: userId, ai_provider: aiProvider },
      { onConflict: 'user_id' }
    )
  }, [aiProvider, userId])

  useEffect(() => {
    if (!openMenu) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-table-menu-root="true"]')) return
      if (target.closest('[data-table-menu-button="true"]')) return
      setOpenMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [openMenu])

  // If a table is deleted from elsewhere (e.g. /tables card menu), remove it here too.
  useEffect(() => {
    const onDeleted = (evt: Event) => {
      const e = evt as CustomEvent<{ tableId?: string }>
      const tableId = e.detail?.tableId
      if (!tableId) return
      setTables((prev) => {
        const next = prev.filter((t) => t.id !== tableId)
        // Persist deletion immediately so a refresh doesn't re-show stale cached items.
        writeTablesCache(next)
        return next
      })
      if (openMenu?.tableId === tableId) setOpenMenu(null)
      if (confirmDeleteTableId === tableId) setConfirmDeleteTableId(null)
      if (renameTableId === tableId) setRenameTableId(null)
    }
    window.addEventListener(TABLE_DELETED_EVENT, onDeleted as EventListener)
    return () => window.removeEventListener(TABLE_DELETED_EVENT, onDeleted as EventListener)
  }, [openMenu?.tableId, confirmDeleteTableId, renameTableId])

  const deleteTable = async (tableId: string) => {
    if (isDeletingTable) return
    setIsDeletingTable(true)
    try {
      const res = await fetch(`/api/tables/${tableId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to delete table')

      setTables((prev) => {
        const next = prev.filter((t) => t.id !== tableId)
        writeTablesCache(next)
        return next
      })
      setOpenMenu(null)
      setConfirmDeleteTableId(null)
      window.dispatchEvent(new CustomEvent(TABLE_DELETED_EVENT, { detail: { tableId } }))

      // If the user is currently viewing the deleted table, take them back to /tables.
      if (pathname === `/tables/${tableId}`) {
        router.push('/tables')
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete table')
    } finally {
      setIsDeletingTable(false)
    }
  }

  useEffect(() => {
    const fetchTables = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/login')
        return
      }
      setUserId(user.id)

      // Try DB preference first, fallback to localStorage.
      try {
        const { data: settings } = await supabase
          .from('user_settings')
          .select('ai_provider')
          .eq('user_id', user.id)
          .maybeSingle()

        const pref = settings?.ai_provider
        if (pref === 'gemini' || pref === 'chatpdf') {
          setAiProvider(pref)
          try {
            localStorage.setItem(AI_PROVIDER_STORAGE_KEY, pref)
          } catch {
            // ignore
          }
        }
      } finally {
        // From this point on, changes should be persisted to DB.
        didInitAiProviderRef.current = true
      }

      const { data, error } = await supabase
        .from('user_tables')
        .select('id, table_name, updated_at')
        .order('updated_at', { ascending: false })

      if (!error && data) {
        setTables(data)
      }
      // From this point, it's safe to overwrite cache even with an empty list.
      didHydrateFromServerRef.current = true
      setLoading(false)
    }

    fetchTables()
  }, [router])

  // Keep cache in sync with the latest in-memory ordering to avoid flicker on route transitions.
  // Important: don't overwrite cache with an empty list on the very first mount
  // (before we know the server truth).
  useEffect(() => {
    if (!didHydrateFromServerRef.current && !tables.length) return
    writeTablesCache(tables)
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

  // When a new table is created from /tables/new, merge it into the sidebar list immediately.
  useEffect(() => {
    const onCreated = (evt: Event) => {
      const e = evt as CustomEvent<{ table: Table }>
      const table = e.detail?.table
      if (!table?.id) return

      setTables((prev) => {
        // Avoid duplicates if sidebar already has it (e.g. after a refresh).
        const exists = prev.some((t) => t.id === table.id)
        if (exists) return prev

        const next: Table[] = [
          {
            id: table.id,
            table_name: table.table_name ?? 'Untitled',
            updated_at: table.updated_at ?? new Date().toISOString(),
          },
          ...prev,
        ]
        next.sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0))
        return next
      })
    }

    window.addEventListener(TABLE_CREATED_EVENT, onCreated as EventListener)
    return () => window.removeEventListener(TABLE_CREATED_EVENT, onCreated as EventListener)
  }, [])

  return (
    <aside
      className={[
        'fixed left-0 top-0 bottom-0 w-80 z-50 transition-transform duration-300 ease-out',
        collapsed ? '-translate-x-full' : 'translate-x-0',
      ].join(' ')}
    >
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
        className="sidebar-shell relative h-full overflow-hidden rounded-tr-[28px] rounded-br-[28px] bg-sidebar text-sidebar-foreground"
      >
        {/* Background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-tr-[28px] rounded-br-[28px]">
          {/* Subtle gradient wash (token-based) */}
          <div className="absolute inset-0 rounded-tr-[28px] rounded-br-[28px] bg-gradient-to-b from-sidebar via-sidebar to-sidebar/95" />
          {/* Spotlight card effect (mouse-follow) */}
          <div
            className="absolute inset-0 rounded-tr-[28px] rounded-br-[28px]"
            style={{
              opacity: 'var(--spot-o, 0)',
              background:
                'radial-gradient(320px circle at var(--spot-x, 50%) var(--spot-y, 20%), color-mix(in oklch, var(--sidebar-primary) 18%, transparent), transparent 58%)',
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
        <div className="pointer-events-none absolute z-30 inset-y-0 right-0 w-px bg-sidebar-border" />
        <div className="pointer-events-none absolute z-30 inset-y-6 right-[1px] w-px bg-gradient-to-b from-transparent via-sidebar-foreground/30 to-transparent opacity-95" />

        {/* Foreground */}
        <div className="relative z-10 flex h-full flex-col px-5 pt-10 pb-5">
          <div className="pb-4">
            <div className="flex items-center justify-between gap-3">
              <Link
                href="/tables"
                className="flex items-center gap-[3.0px] font-serif text-[24px] leading-none font-normal tracking-tight text-sidebar-foreground/95 hover:text-sidebar-foreground transition-colors"
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-10 w-10 bg-primary"
                  style={{
                    WebkitMaskImage: 'url(/base_logo.png)',
                    WebkitMaskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center',
                    WebkitMaskSize: 'contain',
                    maskImage: 'url(/base_logo.png)',
                    maskRepeat: 'no-repeat',
                    maskPosition: 'center',
                    maskSize: 'contain',
                  }}
                />
                clariparse
              </Link>
              <div className="flex items-center gap-2">
                <ThemeToggle className="px-2 py-1.5" />
                <button
                  type="button"
                  aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
                  onClick={() => onToggleCollapsed?.()}
                  className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-2 py-1.5 text-foreground shadow-sm backdrop-blur-md transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>
            </div>
            {/* Divider */}
            <div className="mt-5 h-px w-full bg-gradient-to-r from-transparent from-[0.1px] via-sidebar-foreground/35 to-transparent to-[calc(100%-0.1px)]" />
          </div>

          <div className="pt-2 pb-5">
            <Link
              href="/tables/new"
              className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-primary/35 bg-primary text-primary-foreground px-4 py-3 text-[15px] font-medium shadow-sm backdrop-blur-md transition-[background-color,border-color,transform,box-shadow,filter] duration-200 ease-out hover:-translate-y-[1px] hover:shadow-md hover:brightness-[1.03] active:translate-y-0 active:brightness-[0.99] dark:border-primary/40"
            >
              {/* subtle glass highlight */}
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary-foreground/18 to-transparent opacity-60 transition-opacity duration-200 group-hover:opacity-80" />

              <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-full border border-primary-foreground/45 bg-primary-foreground/14 text-primary-foreground transition-[border-color,background-color,transform] duration-200 ease-out group-hover:border-primary-foreground/60 group-hover:bg-primary-foreground/18 group-hover:scale-[1.02]">
                <Plus className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>New Table</span>
            </Link>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <div className="px-1 pb-2 text-[13px] font-semibold tracking-[0.18em] text-sidebar-foreground/60">
              TABLES
            </div>

            <div className="relative flex-1 min-h-0">
              <div className="sidebar-scroll sidebar-scroll-fade h-full overflow-y-auto pr-1 pb-6">
              {/* Only show Loading when we truly have no cached tables */}
              {loading && tables.length === 0 ? (
                <div className="px-2 py-2 space-y-2">
                  <div className="h-4 w-28 rounded-lg bg-sidebar-accent/70" />
                  <div className="h-4 w-36 rounded-lg bg-sidebar-accent/70" />
                  <div className="h-4 w-24 rounded-lg bg-sidebar-accent/70" />
                </div>
              ) : tables.length === 0 ? (
                <div className="px-2 py-2 text-sm text-sidebar-foreground/70">No tables yet</div>
              ) : (
                <div className="space-y-1.5">
                  {tables.map((table) => {
                    const isActive = pathname === `/tables/${table.id}`
                    const isMenuOpen = openMenu?.tableId === table.id
                    return (
                      <div
                        key={table.id}
                        className={[
                          'group/table relative rounded-xl border transition-[background-color,border-color,box-shadow,color] duration-200 ease-out',
                          isActive
                            ? 'bg-sidebar-primary/10 border-sidebar-primary/25 text-sidebar-foreground shadow-[inset_0_1px_0_color-mix(in_oklch,var(--sidebar-foreground)_12%,transparent)] dark:bg-sidebar-primary/20 dark:border-sidebar-primary/35 dark:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--sidebar-primary-foreground)_16%,transparent)]'
                            : isMenuOpen
                              ? 'bg-sidebar-accent/70 border-sidebar-border/80 text-sidebar-foreground shadow-sm dark:bg-sidebar-accent/55 dark:border-sidebar-foreground/20'
                              : 'border-transparent text-sidebar-foreground/85 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground hover:border-sidebar-border/80 hover:shadow-sm dark:hover:bg-sidebar-accent/55 dark:hover:border-sidebar-foreground/20',
                        ].join(' ')}
                      >
                        <Link href={`/tables/${table.id}`} className="block px-4 py-2.5 pr-10 text-[15px] leading-snug">
                          {table.table_name}
                        </Link>

                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          <button
                            type="button"
                            aria-label="Table actions"
                            data-table-menu-button="true"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                              const menuW = 176 // w-44
                              const pad = 10
                              const maxLeft = Math.max(pad, window.innerWidth - menuW - pad)
                              const left = Math.min(maxLeft, Math.max(pad, rect.right - menuW))
                              const top = rect.bottom + 8
                              setOpenMenu((prev) => (prev?.tableId === table.id ? null : { tableId: table.id, left, top }))
                            }}
                            className={[
                              'inline-flex h-8 w-8 items-center justify-center rounded-lg',
                              'opacity-0 group-hover/table:opacity-100 transition-opacity',
                              'text-sidebar-foreground/55 hover:text-sidebar-foreground/80',
                            ].join(' ')}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              </div>
            </div>
          </div>

          {/* Provider toggle (bottom) */}
          <div className="relative z-20 -mx-5 px-5 pt-5 bg-transparent">
            <div className="h-px w-full bg-gradient-to-r from-transparent from-[0.1px] via-sidebar-foreground/20 to-transparent to-[calc(100%-0.1px)]" />
            <div className="mt-4">
              <div className="px-1 pb-2 text-[12px] font-semibold tracking-[0.18em] text-sidebar-foreground/60">
                MODEL
              </div>
              <div className="inline-flex w-full rounded-xl border border-border bg-card/70 p-1 shadow-sm backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setAiProvider('chatpdf')}
                  className={[
                    'flex-1 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                    aiProvider === 'chatpdf'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground/80 hover:bg-muted/40',
                  ].join(' ')}
                  aria-pressed={aiProvider === 'chatpdf'}
                >
                  ChatPDF
                </button>
                <button
                  type="button"
                  onClick={() => setAiProvider('gemini')}
                  className={[
                    'flex-1 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                    aiProvider === 'gemini'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground/80 hover:bg-muted/40',
                  ].join(' ')}
                  aria-pressed={aiProvider === 'gemini'}
                >
                  Gemini
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {openMenu && (
        <div
          data-table-menu-root="true"
          className="fixed z-[100] w-44 rounded-xl border border-border bg-card shadow-lg backdrop-blur-md overflow-hidden"
          style={{ left: openMenu.left, top: openMenu.top }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setRenameTableId(openMenu.tableId)
              setOpenMenu(null)
            }}
            className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
          >
            <Pencil className="h-4 w-4 opacity-80" />
            Rename…
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setConfirmDeleteTableId(openMenu.tableId)
              setOpenMenu(null)
            }}
            className="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10 flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteTableId !== null}
        title="Delete table permanently?"
        description="This will permanently delete the table, all extracted rows, and all uploaded PDFs for this table. This cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        destructive
        isLoading={isDeletingTable}
        onCancel={() => {
          if (isDeletingTable) return
          setConfirmDeleteTableId(null)
        }}
        onConfirm={() => {
          if (!confirmDeleteTableId) return
          void deleteTable(confirmDeleteTableId)
        }}
      />

      <RenameTableModal
        isOpen={renameTableId !== null}
        tableId={renameTableId}
        initialName={tables.find((t) => t.id === renameTableId)?.table_name ?? 'Untitled'}
        onClose={() => setRenameTableId(null)}
        onRenamed={({ tableId, table_name, updated_at }) => {
          // Update sidebar state immediately
          setTables((prev) => {
            const next = prev.map((t) =>
              t.id === tableId ? { ...t, table_name, updated_at: updated_at ?? new Date().toISOString() } : t
            )
            next.sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0))
            return next
          })
          // Notify rest of app
          window.dispatchEvent(
            new CustomEvent(TABLE_NAME_UPDATED_EVENT, {
              detail: { tableId, table_name, updated_at: updated_at ?? new Date().toISOString() },
            })
          )
          window.dispatchEvent(
            new CustomEvent(TABLE_TOUCHED_EVENT, {
              detail: { tableId, updated_at: updated_at ?? new Date().toISOString() },
            })
          )
        }}
      />
    </aside>
  )
}

