'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import ConfirmDialog from '@/app/components/ConfirmDialog'
import RenameTableModal from '@/app/components/RenameTableModal'
import {
  PROFILE_UPDATED_EVENT,
  TABLE_CREATED_EVENT,
  TABLE_DELETED_EVENT,
  TABLE_NAME_UPDATED_EVENT,
  TABLE_TOUCHED_EVENT,
} from '@/lib/constants/events'
import { FIRST_NAME_CACHE_KEY, GREETING_CACHE_KEY, SIDEBAR_TABLES_CACHE_KEY } from '@/lib/constants/storage'

type TableSummary = {
  id: string
  table_name: string
  created_at: string
  updated_at: string
  records_count: number
}

type HttpError = Error & { status?: number }

const GREETING_OPTIONS = [
  'Hello',
  'Hi',
  'Hey',
  'Welcome',
  'Nice to see you',
] as const

function pickGreeting(): string {
  return GREETING_OPTIONS[Math.floor(Math.random() * GREETING_OPTIONS.length)] ?? 'Hello'
}

function extractFirstName(fullName: string): string {
  const cleaned = fullName.trim().replace(/\s+/g, ' ')
  if (!cleaned) return ''
  return cleaned.split(' ')[0] ?? ''
}

function firstNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  const cleaned = local.replace(/[._-]+/g, ' ').trim()
  const first = cleaned.split(' ')[0] ?? ''
  return first ? first[0]!.toUpperCase() + first.slice(1) : ''
}

function readCachedFirstName(): string {
  try {
    const raw = sessionStorage.getItem(FIRST_NAME_CACHE_KEY)
    return typeof raw === 'string' ? raw : ''
  } catch {
    return ''
  }
}

function writeCachedFirstName(name: string) {
  try {
    sessionStorage.setItem(FIRST_NAME_CACHE_KEY, name)
  } catch {
    // ignore
  }
}

function readSidebarTablesCache(): TableSummary[] | undefined {
  try {
    const raw = sessionStorage.getItem(SIDEBAR_TABLES_CACHE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return undefined
    const now = new Date().toISOString()
    return parsed
      .filter(Boolean)
      .map((t: any) => ({
        id: String(t.id ?? ''),
        table_name: typeof t.table_name === 'string' ? t.table_name : 'Untitled',
        created_at: typeof t.created_at === 'string' ? t.created_at : now,
        updated_at: typeof t.updated_at === 'string' ? t.updated_at : now,
        records_count: typeof t.records_count === 'number' ? t.records_count : 0,
      }))
      .filter((t: TableSummary) => !!t.id)
  } catch {
    return undefined
  }
}

const fetcher = async (url: string): Promise<TableSummary[]> => {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({} as any))
    const err: HttpError = new Error(data?.error || 'Failed to load tables')
    err.status = res.status
    throw err
  }
  return res.json()
}

function AnimatedText({ text, className }: { text: string; className?: string }) {
  return (
    <span
      key={text}
      className={[
        // Uses tailwindcss-animate if available; otherwise these are harmless no-ops.
        'inline-block animate-in fade-in slide-in-from-bottom-1 duration-200',
        className ?? '',
      ].join(' ')}
    >
      {text}
    </span>
  )
}

export default function TablesPage() {
  const router = useRouter()
  // Avoid SSR/client hydration flicker by not using randomness or sessionStorage reads as initial state.
  // We'll populate these on mount and animate them in.
  const [greeting, setGreeting] = useState<string>('')
  const [firstName, setFirstName] = useState<string>('')
  const [openMenu, setOpenMenu] = useState<{ tableId: string; left: number; top: number } | null>(null)
  const [confirmDeleteTableId, setConfirmDeleteTableId] = useState<string | null>(null)
  const [isDeletingTable, setIsDeletingTable] = useState(false)
  const [renameTableId, setRenameTableId] = useState<string | null>(null)

  const cachedTables = useMemo(() => (typeof window === 'undefined' ? undefined : readSidebarTablesCache()), [])
  const {
    data: tables,
    error,
    isLoading,
    mutate,
  } = useSWR<TableSummary[], HttpError>('/api/tables', fetcher, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    fallbackData: cachedTables,
  })

  useEffect(() => {
    if (error?.status === 401) {
      router.push('/login')
    }
  }, [error, router])

  // Seed greeting + cached name on mount (no hydration mismatch).
  useEffect(() => {
    try {
      const cached = readCachedFirstName()
      if (cached) setFirstName(cached)
    } catch {
      // ignore
    }

    try {
      const key = GREETING_CACHE_KEY
      const existing = sessionStorage.getItem(key)
      if (existing) {
        setGreeting(existing)
      } else {
        const next = pickGreeting()
        sessionStorage.setItem(key, next)
        setGreeting(next)
      }
    } catch {
      setGreeting(pickGreeting())
    }
  }, [])

  useEffect(() => {
    if (!openMenu) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-table-card-menu-root="true"]')) return
      if (target.closest('[data-table-card-menu-button="true"]')) return
      setOpenMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [openMenu])

  // Greeting: resolve first name (profiles.full_name -> auth metadata -> email).
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) return

        const fallbackMeta =
          user.user_metadata && typeof user.user_metadata.full_name === 'string'
            ? user.user_metadata.full_name
            : ''

        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle()

        if (cancelled) return

        const name = (profile?.full_name ?? fallbackMeta ?? '').toString()
        const first = extractFirstName(name) || (user.email ? firstNameFromEmail(user.email) : '')
        setFirstName(first)
        writeCachedFirstName(first)
      } catch {
        // Keep greeting generic on failure.
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [])

  // If the user updates their profile name in Settings, update immediately (no stale flash).
  useEffect(() => {
    const onProfileUpdated = (evt: Event) => {
      const e = evt as CustomEvent<{ first_name?: string }>
      const next = (e.detail?.first_name ?? '').trim()
      if (!next) return
      setFirstName(next)
      writeCachedFirstName(next)
    }
    window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated as EventListener)
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated as EventListener)
  }, [])

  // Keep the list in sync with app-wide events so it updates immediately.
  useEffect(() => {
    const onCreated = (evt: Event) => {
      const e = evt as CustomEvent<{ table?: TableSummary }>
      const table = e.detail?.table
      if (!table?.id) return
      void mutate((prev) => {
        const existing = Array.isArray(prev) ? prev : []
        if (existing.some((t) => t.id === table.id)) return existing
        const next = [
          { ...table, records_count: typeof table.records_count === 'number' ? table.records_count : 0 },
          ...existing,
        ]
        next.sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0))
        return next
      }, { revalidate: false })
    }

    const onNameUpdated = (evt: Event) => {
      const e = evt as CustomEvent<{ tableId: string; table_name: string; updated_at?: string }>
      const { tableId, table_name, updated_at } = e.detail || ({} as any)
      if (!tableId || typeof table_name !== 'string') return
      void mutate((prev) => {
        const existing = Array.isArray(prev) ? prev : []
        const next = existing.map((t) =>
          t.id === tableId ? { ...t, table_name, updated_at: updated_at ?? new Date().toISOString() } : t
        )
        next.sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0))
        return next
      }, { revalidate: false })
    }

    const onTouched = (evt: Event) => {
      const e = evt as CustomEvent<{ tableId: string; updated_at?: string }>
      const { tableId, updated_at } = e.detail || ({} as any)
      if (!tableId) return
      void mutate((prev) => {
        const existing = Array.isArray(prev) ? prev : []
        const nextUpdatedAt = updated_at ?? new Date().toISOString()
        const next = existing.map((t) => (t.id === tableId ? { ...t, updated_at: nextUpdatedAt } : t))
        next.sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0))
        return next
      }, { revalidate: false })
    }

    const onDeleted = (evt: Event) => {
      const e = evt as CustomEvent<{ tableId?: string }>
      const tableId = e.detail?.tableId
      if (!tableId) return
      void mutate((prev) => {
        const existing = Array.isArray(prev) ? prev : []
        return existing.filter((t) => t.id !== tableId)
      }, { revalidate: false })
    }

    window.addEventListener(TABLE_CREATED_EVENT, onCreated as EventListener)
    window.addEventListener(TABLE_NAME_UPDATED_EVENT, onNameUpdated as EventListener)
    window.addEventListener(TABLE_TOUCHED_EVENT, onTouched as EventListener)
    window.addEventListener(TABLE_DELETED_EVENT, onDeleted as EventListener)
    return () => {
      window.removeEventListener(TABLE_CREATED_EVENT, onCreated as EventListener)
      window.removeEventListener(TABLE_NAME_UPDATED_EVENT, onNameUpdated as EventListener)
      window.removeEventListener(TABLE_TOUCHED_EVENT, onTouched as EventListener)
      window.removeEventListener(TABLE_DELETED_EVENT, onDeleted as EventListener)
    }
  }, [mutate])

  return (
    <div className="pl-[100px] pr-8 pb-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-foreground mb-2 min-h-[2.5rem]">
          {greeting ? <AnimatedText text={greeting} /> : null}
          {firstName ? (
            <>
              {' '}
              <AnimatedText text={firstName} />
            </>
          ) : null}
        </h1>
        <p className="text-muted-foreground">Create and manage your data extraction tables here</p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive mb-4">
          Error loading tables: {error.message}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <Card key={idx}>
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="mt-2 h-4 w-28" />
              </CardHeader>
              <CardContent />
            </Card>
          ))}
        </div>
      ) : !tables || tables.length === 0 ? (
        <div className="text-center py-16">
          <div className="max-w-md mx-auto">
            <h2 className="text-2xl font-semibold text-foreground mb-2">No Tables Yet</h2>
            <p className="text-muted-foreground mb-6">Create your first table to start extracting data from PDFs</p>
            <Button asChild>
              <Link href="/tables/new">
                <span className="inline-flex items-center gap-3">
                  <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-full border border-primary-foreground/45 bg-primary-foreground/14 text-primary-foreground">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span>New Table</span>
                </span>
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tables.map((table) => (
            <div key={table.id} className="group relative">
              <Link href={`/tables/${table.id}`} className="block">
                <Card className="hover:shadow-md group-hover:shadow-md group-hover:border-ring/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg pr-8">
                      <AnimatedText text={table.table_name} />
                    </CardTitle>
                    <CardDescription>
                      {table.records_count} Record{table.records_count === 1 ? '' : 's'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent />
                </Card>
              </Link>

              <button
                type="button"
                aria-label="Table actions"
                data-table-card-menu-button="true"
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
                  'absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-lg',
                  'opacity-0 group-hover:opacity-100 transition-opacity',
                  'text-muted-foreground hover:text-foreground hover:bg-accent',
                ].join(' ')}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {openMenu && (
        <div
          data-table-card-menu-root="true"
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
          const id = confirmDeleteTableId
          if (!id || isDeletingTable) return
          setIsDeletingTable(true)
          void (async () => {
            try {
              const res = await fetch(`/api/tables/${id}`, { method: 'DELETE' })
              const data = await res.json().catch(() => ({}))
              if (!res.ok) throw new Error(data?.error || 'Failed to delete table')
              // Update local list immediately
              void mutate((prev) => (Array.isArray(prev) ? prev.filter((t) => t.id !== id) : prev), { revalidate: false })
              window.dispatchEvent(new CustomEvent(TABLE_DELETED_EVENT, { detail: { tableId: id } }))
              setConfirmDeleteTableId(null)
            } catch (err) {
              alert(err instanceof Error ? err.message : 'Failed to delete table')
            } finally {
              setIsDeletingTable(false)
            }
          })()
        }}
      />

      <RenameTableModal
        isOpen={renameTableId !== null}
        tableId={renameTableId}
        initialName={tables?.find((t) => t.id === renameTableId)?.table_name ?? 'Untitled'}
        onClose={() => setRenameTableId(null)}
        onRenamed={({ tableId, table_name, updated_at }) => {
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
    </div>
  )
}

