'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import useSWR from 'swr'
import PdfThumbnailCell from './PdfThumbnailCell'
import AddColumnModal from '@/app/components/AddColumnModal'
import ConfirmDialog from '@/app/components/ConfirmDialog'
import EditColumnModal from '@/app/components/EditColumnModal'
import { generateVariableKey } from '@/lib/utils/slugify'
import type { Column, ExtractedRow } from '@/types/api'
import { Plus } from 'lucide-react'

interface ExtractedRowsGridProps {
  tableId: string
  columns: Column[]
  onColumnsChange?: (columns: Column[]) => void
}

const fetcher = async (url: string): Promise<ExtractedRow[]> => {
  const res = await fetch(url)
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`
    throw new Error(msg)
  }
  if (!Array.isArray(data)) {
    throw new Error('Unexpected response shape')
  }
  return data as ExtractedRow[]
}

function AddColumnButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl border border-primary/35 bg-primary px-2.5 py-1.5 text-[13px] font-medium text-primary-foreground shadow-sm backdrop-blur-md transition-[transform,box-shadow,filter] duration-200 ease-out hover:-translate-y-[1px] hover:shadow-md hover:brightness-[1.03] active:translate-y-0 active:brightness-[0.99]"
    >
      {/* subtle glass highlight */}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary-foreground/18 to-transparent opacity-60 transition-opacity duration-200 group-hover:opacity-80" />
      <span className="relative inline-flex h-5 w-5 items-center justify-center rounded-full border border-primary-foreground/45 bg-primary-foreground/14 text-primary-foreground transition-[border-color,background-color,transform] duration-200 ease-out group-hover:border-primary-foreground/60 group-hover:bg-primary-foreground/18">
        <Plus className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="relative">Add Column</span>
    </button>
  )
}

export default function ExtractedRowsGrid({ tableId, columns, onColumnsChange }: ExtractedRowsGridProps) {
  const [editingCell, setEditingCell] = useState<{ rowId: string; columnKey: string } | null>(null)
  const [editingValue, setEditingValue] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)
  const [isAddColumnOpen, setIsAddColumnOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const rowsContainerRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const tableWrapRef = useRef<HTMLDivElement>(null)
  const colHeaderRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const colCellRefs = useRef<Record<string, Record<string, HTMLDivElement | null>>>({})

  // Column resizing
  const MIN_COL_WIDTH = 160
  const MAX_COL_WIDTH = 560
  const DEFAULT_COL_WIDTH = 260
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const resizeRef = useRef<{
    key: string
    startX: number
    startWidth: number
  } | null>(null)

  const [editColumn, setEditColumn] = useState<Column | null>(null)
  const [isSavingColumn, setIsSavingColumn] = useState(false)
  const [isDeletingColumn, setIsDeletingColumn] = useState(false)
  const [confirmDeleteColumnKey, setConfirmDeleteColumnKey] = useState<string | null>(null)

  // This component instance persists across /tables/[tableId] route changes due to the layout shell.
  // Reset per-table UI state so “open” dialogs don’t carry over to the next table.
  useEffect(() => {
    setEditColumn(null)
    setConfirmDeleteColumnKey(null)
    setIsAddColumnOpen(false)
    setEditingCell(null)
    setEditingValue('')
    setSelectedRowIds(new Set())
    setLastSelectedRowId(null)
    setConfirmDeleteRowsOpen(false)
    setConfirmDeleteSingleRowId(null)
  }, [tableId])

  // Row selection mode (Notion-like)
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())
  const [lastSelectedRowId, setLastSelectedRowId] = useState<string | null>(null)
  const [selectionBarTop, setSelectionBarTop] = useState<number | null>(null)
  const [confirmDeleteRowsOpen, setConfirmDeleteRowsOpen] = useState(false)
  const [confirmDeleteSingleRowId, setConfirmDeleteSingleRowId] = useState<string | null>(null)
  const lastSelectionActionRef = useRef<'select' | 'deselect' | null>(null)

  const selectionMode = selectedRowIds.size > 0

  // Row drag-reorder
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null)
  const [dragOrder, setDragOrder] = useState<string[] | null>(null)
  const dragPointerIdRef = useRef<number | null>(null)
  const flipPrevTopsRef = useRef<Map<string, number> | null>(null)
  const [dragPointer, setDragPointer] = useState<{ x: number; y: number } | null>(null)
  const [dragGhostRect, setDragGhostRect] = useState<{ left: number; top: number; width: number; height: number } | null>(
    null
  )
  const dragGhostOffsetRef = useRef<{ x: number; y: number } | null>(null)
  const [dragHasMoved, setDragHasMoved] = useState(false)

  // Column drag-reorder (drag the header itself)
  const [draggingColKey, setDraggingColKey] = useState<string | null>(null)
  const [colDragOrderKeys, setColDragOrderKeys] = useState<string[] | null>(null)
  const colPointerIdRef = useRef<number | null>(null)
  const colFlipPrevLeftsRef = useRef<Record<string, number> | null>(null)
  const [colDragPointer, setColDragPointer] = useState<{ x: number; y: number } | null>(null)
  const [colGhostRect, setColGhostRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const colGhostOffsetRef = useRef<{ x: number; y: number } | null>(null)
  const [colDragHasMoved, setColDragHasMoved] = useState(false)
  const colDropPrevLeftsRef = useRef<Record<string, number> | null>(null)

  const captureRowTops = (ids: string[]) => {
    const m = new Map<string, number>()
    for (const id of ids) {
      const el = rowRefs.current[id]
      if (!el) continue
      m.set(id, el.getBoundingClientRect().top)
    }
    flipPrevTopsRef.current = m
  }

  const { data: rows, error, mutate } = useSWR<ExtractedRow[]>(
    `/api/tables/${tableId}/rows`,
    fetcher,
    {
      // Fast polling during extraction; slow background refresh while idle to keep signed URLs fresh.
      refreshInterval: (latest) => {
        const isExtracting =
          Array.isArray(latest) && latest.some((r) => r.status === 'extracting' || r.status === 'uploaded')
        if (isExtracting) return 2000
        return 30 * 60 * 1000 // 30 minutes
      },
      keepPreviousData: true,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      focusThrottleInterval: 60 * 1000,
      // Avoid revalidations while the user is actively interacting (prevents focus/selection quirks).
      isPaused: () =>
        isSaving || editingCell !== null || selectionMode || draggingRowId !== null || draggingColKey !== null,
    }
  )

  const sortedColumns = [...columns].sort((a, b) => a.order - b.order)
  const columnsByKey = (() => {
    const m: Record<string, Column> = {}
    for (let i = 0; i < sortedColumns.length; i++) {
      const c = sortedColumns[i]
      m[c.key] = c
    }
    return m
  })()

  // Column drag only reorders HEADER while dragging; body stays stable until drop.
  const headerOrderKeys = colDragOrderKeys ?? sortedColumns.map((c) => c.key)
  const headerColumns = headerOrderKeys.map((k) => columnsByKey[k]).filter(Boolean)
  const bodyColumns = sortedColumns

  const getRowOrderValue = (r: ExtractedRow) => {
    if (typeof r.row_order === 'number') return r.row_order
    const t = Date.parse(r.created_at)
    return Number.isFinite(t) ? t / 1000 : Date.now() / 1000
  }

  const moveItem = <T,>(arr: T[], from: number, to: number) => {
    const copy = arr.slice()
    const [item] = copy.splice(from, 1)
    copy.splice(to, 0, item)
    return copy
  }

  const persistColumnOrder = async (orderedKeys: string[]) => {
    if (isSavingColumn) return
    const prevColumns = columns
    if (!orderedKeys?.length) return

    const orderByKey: Record<string, number> = {}
    for (let i = 0; i < orderedKeys.length; i++) {
      orderByKey[orderedKeys[i]] = i
    }

    const nextColumns = prevColumns
      .map((c) => (orderByKey[c.key] !== undefined ? { ...c, order: orderByKey[c.key] } : c))
      .sort((a, b) => a.order - b.order)

    // Optimistic UI update
    setIsSavingColumn(true)
    if (onColumnsChange) onColumnsChange(nextColumns)

    try {
      const res = await fetch(`/api/tables/${tableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns: nextColumns }),
      })
      if (!res.ok) throw new Error('Failed to reorder columns')
      if (!onColumnsChange) window.location.reload()

      window.dispatchEvent(
        new CustomEvent('pdf-tables:table-touched', {
          detail: { tableId, updated_at: new Date().toISOString() },
        })
      )
    } catch (e) {
      if (onColumnsChange) onColumnsChange(prevColumns)
      alert('Failed to reorder columns. Please try again.')
    } finally {
      setIsSavingColumn(false)
    }
  }

  // SWR cache can briefly contain non-array data (e.g. prior fetcher returned an error object).
  // Guard all row list ops to avoid runtime crashes.
  const rowsList: ExtractedRow[] | null = Array.isArray(rows) ? (rows as ExtractedRow[]) : null
  const hasServerRowOrder = !!rowsList?.some((r) => typeof r.row_order === 'number')
  const [pendingOrderIds, setPendingOrderIds] = useState<string[] | null>(null)
  const isDragActive = draggingRowId !== null
  const isColDragActive = draggingColKey !== null

  const baseRowIds = rowsList?.map((r) => r.id) ?? []

  // Local persisted ordering (works even if the DB migration isn't applied yet).
  const ORDER_STORAGE_KEY = `pdf-tables:row-order:${tableId}`
  const [persistedOrder, setPersistedOrder] = useState<string[] | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ORDER_STORAGE_KEY)
      if (!raw) {
        setPersistedOrder(null)
        return
      }
      const parsed = JSON.parse(raw)
      setPersistedOrder(Array.isArray(parsed) ? (parsed as string[]) : null)
    } catch {
      setPersistedOrder(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId])

  // If we ever see a cached non-array payload (e.g. old fetcher cached `{ error: ... }`),
  // kick a revalidation to self-heal without requiring a hard refresh.
  useEffect(() => {
    if (rows && !Array.isArray(rows) && !error) {
      void mutate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, error])

  // Clear pending order once server order matches
  useEffect(() => {
    if (!pendingOrderIds) return
    const sameLength = pendingOrderIds.length === baseRowIds.length
    const sameOrder = sameLength && pendingOrderIds.every((id, idx) => id === baseRowIds[idx])
    if (sameOrder) {
      setPendingOrderIds(null)
    }
  }, [pendingOrderIds, baseRowIds])

  const mergedPersistedOrder = (() => {
    // If server-side ordering exists, ignore local ordering to avoid fighting the DB.
    if (hasServerRowOrder) return null
    if (!persistedOrder?.length) return null
    const present = new Set(baseRowIds)
    const persistedFiltered = persistedOrder.filter((id) => present.has(id))
    const persistedSet = new Set(persistedFiltered)
    // New rows should appear at the top (baseRowIds is server order: newest first)
    const missing = baseRowIds.filter((id) => !persistedSet.has(id))
    const merged = [...missing, ...persistedFiltered]
    return merged.length ? merged : null
  })()

  const displayRowIds = dragOrder ?? pendingOrderIds ?? mergedPersistedOrder ?? baseRowIds
  const rowsById = new Map((rowsList ?? []).map((r) => [r.id, r] as const))
  const displayRows = displayRowIds.map((id) => rowsById.get(id)).filter(Boolean) as ExtractedRow[]

  const ghostRow =
    dragHasMoved && draggingRowId ? (rowsById.get(draggingRowId) as ExtractedRow | undefined) : undefined

  const ghostColumn = colDragHasMoved && draggingColKey ? columnsByKey[draggingColKey] : undefined

  const captureColLefts = (keys: string[]) => {
    const pos: Record<string, number> = {}
    // Header cells
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      const el = colHeaderRefs.current[k]
      if (!el) continue
      pos[`h:${k}`] = el.getBoundingClientRect().left
    }
    colFlipPrevLeftsRef.current = pos
  }

  const captureBodyLeftsForDrop = (keys: string[]) => {
    const pos: Record<string, number> = {}
    for (let r = 0; r < displayRows.length; r++) {
      const rowId = displayRows[r].id
      const rowMap = colCellRefs.current[rowId]
      if (!rowMap) continue
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]
        const el = rowMap[k]
        if (!el) continue
        pos[`c:${rowId}:${k}`] = el.getBoundingClientRect().left
      }
    }
    colDropPrevLeftsRef.current = pos
  }

  const beginColumnDrag = (columnKey: string, e: React.PointerEvent) => {
    if (!sortedColumns.length) return
    if (selectionMode || editingCell !== null || isSaving || isSavingColumn || isDeletingColumn) return
    if (draggingRowId !== null) return
    if (resizeRef.current) return
    if (e.button !== 0) return

    const target = e.target as HTMLElement | null
    if (target?.closest('button')) return
    if (target?.closest('[data-resize-handle="true"]')) return

    e.preventDefault()
    e.stopPropagation()

    colPointerIdRef.current = e.pointerId
    setDraggingColKey(columnKey)
    setColDragOrderKeys(headerColumns.map((c) => c.key))
    setColDragPointer({ x: e.clientX, y: e.clientY })
    setColDragHasMoved(false)

    const el = colHeaderRefs.current[columnKey]
    if (el) {
      const rect = el.getBoundingClientRect()
      setColGhostRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
      colGhostOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    } else {
      setColGhostRect(null)
      colGhostOffsetRef.current = null
    }
  }

  const beginRowDrag = (rowId: string, e: React.PointerEvent) => {
    if (!rowsList?.length) return
    if (selectionMode || editingCell !== null || isSaving) return
    // Only left-click / primary touch
    if (e.button !== 0) return

    e.preventDefault()
    e.stopPropagation()

    dragPointerIdRef.current = e.pointerId
    setDraggingRowId(rowId)
    setDragOrder(displayRowIds.slice())
    setDragPointer({ x: e.clientX, y: e.clientY })
    setDragHasMoved(false)

    const el = rowRefs.current[rowId]
    if (el) {
      const rect = el.getBoundingClientRect()
      setDragGhostRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
      dragGhostOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    } else {
      setDragGhostRect(null)
      dragGhostOffsetRef.current = null
    }
  }

  // FLIP animation for row reordering while dragging (smooth slide)
  useLayoutEffect(() => {
    if (!draggingRowId) return
    const prev = flipPrevTopsRef.current
    if (!prev) return
    flipPrevTopsRef.current = null

    const cleanups: Array<() => void> = []

    prev.forEach((prevTop, id) => {
      const el = rowRefs.current[id]
      if (!el) return
      const nextTop = el.getBoundingClientRect().top
      const delta = prevTop - nextTop
      if (!delta) return

      el.style.transition = 'transform 0s'
      el.style.transform = `translateY(${delta}px)`
      // Force reflow so the browser picks up the transform before we animate it back.
      void el.getBoundingClientRect()
      requestAnimationFrame(() => {
        el.style.transition = 'transform 180ms ease'
        el.style.transform = 'translateY(0)'
      })

      const t = window.setTimeout(() => {
        // Clear inline styles (lets future drags re-apply cleanly)
        if (el.style.transform === 'translateY(0)') el.style.transform = ''
        if (el.style.transition.includes('transform')) el.style.transition = ''
      }, 220)
      cleanups.push(() => window.clearTimeout(t))
    })

    return () => {
      cleanups.forEach((fn) => fn())
    }
  }, [dragOrder, draggingRowId])

  // FLIP animation for column reordering while dragging (smooth slide)
  useLayoutEffect(() => {
    if (!draggingColKey) return
    const prev = colFlipPrevLeftsRef.current
    if (!prev) return
    colFlipPrevLeftsRef.current = null

    const keys = colDragOrderKeys ?? headerColumns.map((c) => c.key)
    const cleanups: Array<() => void> = []

    const animateEl = (el: HTMLElement, prevLeft?: number) => {
      if (prevLeft === undefined) return
      const nextLeft = el.getBoundingClientRect().left
      const dx = prevLeft - nextLeft
      if (!dx) return

      el.style.transition = 'transform 0s'
      el.style.transform = `translateX(${dx}px)`
      void el.getBoundingClientRect()
      requestAnimationFrame(() => {
        el.style.transition = 'transform 180ms ease'
        el.style.transform = 'translateX(0)'
      })

      const t = window.setTimeout(() => {
        if (el.style.transform === 'translateX(0)') el.style.transform = ''
        if (el.style.transition.includes('transform')) el.style.transition = ''
      }, 220)
      cleanups.push(() => window.clearTimeout(t))
    }

    // Header
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      const el = colHeaderRefs.current[k]
      if (!el) continue
      animateEl(el, prev[`h:${k}`])
    }

    return () => {
      cleanups.forEach((fn) => fn())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colDragOrderKeys, draggingColKey])

  // After a column is dropped (and columns prop updates), animate the BODY cells quickly into place.
  useLayoutEffect(() => {
    const prev = colDropPrevLeftsRef.current
    if (!prev) return
    colDropPrevLeftsRef.current = null

    const keys = sortedColumns.map((c) => c.key)
    const cleanups: Array<() => void> = []

    for (let r = 0; r < displayRows.length; r++) {
      const rowId = displayRows[r].id
      const rowMap = colCellRefs.current[rowId]
      if (!rowMap) continue
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]
        const el = rowMap[k]
        if (!el) continue
        const prevLeft = prev[`c:${rowId}:${k}`]
        if (prevLeft === undefined) continue
        const nextLeft = el.getBoundingClientRect().left
        const dx = prevLeft - nextLeft
        if (!dx) continue

        el.style.transition = 'transform 0s'
        el.style.transform = `translateX(${dx}px)`
        void el.getBoundingClientRect()
        requestAnimationFrame(() => {
          el.style.transition = 'transform 140ms ease'
          el.style.transform = 'translateX(0)'
        })

        const t = window.setTimeout(() => {
          if (el.style.transform === 'translateX(0)') el.style.transform = ''
          if (el.style.transition.includes('transform')) el.style.transition = ''
        }, 180)
        cleanups.push(() => window.clearTimeout(t))
      }
    }

    return () => cleanups.forEach((fn) => fn())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedColumns.map((c) => c.key).join('|')])

  useEffect(() => {
    if (!draggingRowId || !dragOrder) return

    const onMove = (ev: PointerEvent) => {
      if (dragPointerIdRef.current != null && ev.pointerId !== dragPointerIdRef.current) return
      setDragPointer({ x: ev.clientX, y: ev.clientY })
      setDragHasMoved(true)

      // Find target index based on pointer Y relative to row midpoints.
      const ids = dragOrder
      const y = ev.clientY
      let targetIndex = ids.length - 1
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]
        const el = rowRefs.current[id]
        if (!el) continue
        const rect = el.getBoundingClientRect()
        const mid = rect.top + rect.height / 2
        if (y < mid) {
          targetIndex = i
          break
        }
      }

      const fromIndex = ids.indexOf(draggingRowId)
      if (fromIndex === -1) return
      const toIndex = targetIndex
      if (toIndex === fromIndex) return
      // Capture current positions for smooth slide (FLIP)
      captureRowTops(ids)
      const nextIds = moveItem(ids, fromIndex, toIndex)
      setDragOrder(nextIds)
    }

    const onUp = async (ev: PointerEvent) => {
      if (dragPointerIdRef.current != null && ev.pointerId !== dragPointerIdRef.current) return
      dragPointerIdRef.current = null

      const finalOrder = dragOrder
      const movedId = draggingRowId

      setDraggingRowId(null)
      setDragOrder(null)
      setDragPointer(null)
      setDragGhostRect(null)
      dragGhostOffsetRef.current = null
      setDragHasMoved(false)
      setPendingOrderIds(finalOrder)

      const movedRow = rowsById.get(movedId)
      if (!movedRow) return

      const idx = finalOrder.indexOf(movedId)
      if (idx === -1) return

      const above = idx > 0 ? rowsById.get(finalOrder[idx - 1]) : undefined
      const below = idx < finalOrder.length - 1 ? rowsById.get(finalOrder[idx + 1]) : undefined
      const aboveOrder = above ? getRowOrderValue(above) : null
      const belowOrder = below ? getRowOrderValue(below) : null

      let nextOrder: number
      if (aboveOrder == null && belowOrder == null) {
        nextOrder = getRowOrderValue(movedRow)
      } else if (aboveOrder == null && belowOrder != null) {
        // Moved to top (desc order)
        nextOrder = belowOrder + 1
      } else if (aboveOrder != null && belowOrder == null) {
        // Moved to bottom (desc order)
        nextOrder = aboveOrder - 1
      } else {
        // Between two rows (desc order: aboveOrder > belowOrder)
        nextOrder = (aboveOrder! + belowOrder!) / 2
        if (nextOrder === aboveOrder || nextOrder === belowOrder) {
          nextOrder = belowOrder! + (aboveOrder! - belowOrder!) / 2
        }
      }

      // Optimistic: update order for moved row locally to prevent flicker.
      await mutate(
        (current) => {
          if (!Array.isArray(current)) return current as any
          return current.map((r) => (r.id === movedId ? { ...r, row_order: nextOrder } : r))
        },
        { revalidate: false }
      )

      // Persist locally so drag-reorder works even when DB migration isn't applied yet.
      try {
        localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(finalOrder))
      } catch {
        // ignore
      }
      if (!hasServerRowOrder) {
        setPersistedOrder(finalOrder)
      }

      try {
        const resp = await fetch(`/api/rows/${movedId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ row_order: nextOrder }),
        })
        if (!resp.ok) throw new Error('Failed to reorder row')
        // Revalidate to ensure server ordering matches.
        void mutate()

        window.dispatchEvent(
          new CustomEvent('pdf-tables:table-touched', {
            detail: { tableId, updated_at: new Date().toISOString() },
          })
        )
      } catch (err) {
        console.error(err)
        // Still revalidate for correctness; local persisted order keeps the UI stable.
        void mutate()
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingRowId, dragOrder])

  useEffect(() => {
    if (!draggingColKey || !colDragOrderKeys) return

    const onMove = (ev: PointerEvent) => {
      if (colPointerIdRef.current != null && ev.pointerId !== colPointerIdRef.current) return
      setColDragPointer({ x: ev.clientX, y: ev.clientY })
      setColDragHasMoved(true)

      const keys = colDragOrderKeys
      const x = ev.clientX
      let targetIndex = keys.length - 1
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]
        const el = colHeaderRefs.current[k]
        if (!el) continue
        const rect = el.getBoundingClientRect()
        const mid = rect.left + rect.width / 2
        if (x < mid) {
          targetIndex = i
          break
        }
      }

      const fromIndex = keys.indexOf(draggingColKey)
      if (fromIndex === -1) return
      const toIndex = targetIndex
      if (toIndex === fromIndex) return

      captureColLefts(keys)
      const nextKeys = moveItem(keys, fromIndex, toIndex)
      setColDragOrderKeys(nextKeys)
    }

    const onUp = async (ev: PointerEvent) => {
      if (colPointerIdRef.current != null && ev.pointerId !== colPointerIdRef.current) return
      colPointerIdRef.current = null

      const finalKeys = colDragOrderKeys.slice()
      const didMove = colDragHasMoved

      setDraggingColKey(null)
      setColDragPointer(null)
      setColGhostRect(null)
      colGhostOffsetRef.current = null
      setColDragHasMoved(false)

      if (!didMove) return

      const currentKeys = sortedColumns.map((c) => c.key)
      const same =
        currentKeys.length === finalKeys.length &&
        currentKeys.every((k, idx) => k === finalKeys[idx])
      if (same) return

      // Capture current BODY positions; after we commit the new order, we'll FLIP animate cells into place.
      captureBodyLeftsForDrop(currentKeys)

      await persistColumnOrder(finalKeys)

      // Keep header order stable until columns prop reflects the change.
      setColDragOrderKeys(finalKeys)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingColKey, colDragOrderKeys, colDragHasMoved])

  // Once the columns prop reflects the committed order, clear the temporary header ordering.
  useEffect(() => {
    if (draggingColKey !== null) return
    if (!colDragOrderKeys) return
    const currentKeys = sortedColumns.map((c) => c.key)
    const same =
      currentKeys.length === colDragOrderKeys.length &&
      currentKeys.every((k, idx) => k === colDragOrderKeys[idx])
    if (same) setColDragOrderKeys(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedColumns.map((c) => c.key).join('|'), draggingColKey, colDragOrderKeys])

  const getRowTopWithinTable = (rowId: string) => {
    const wrap = tableWrapRef.current
    const rowEl = rowRefs.current[rowId]
    if (!wrap || !rowEl) return null
    const wrapRect = wrap.getBoundingClientRect()
    const rowRect = rowEl.getBoundingClientRect()
    return rowRect.top - wrapRect.top
  }

  const getTopmostSelectedRowId = (ids: Set<string>) => {
    let bestId: string | null = null
    let bestTop = Number.POSITIVE_INFINITY
    for (const id of Array.from(ids)) {
      const top = getRowTopWithinTable(id)
      if (top == null) continue
      if (top < bestTop) {
        bestTop = top
        bestId = id
      }
    }
    // Fallback if refs not ready yet
    return bestId ?? (ids.size ? Array.from(ids)[0] : null)
  }

  const updateSelectionBarPosition = () => {
    if (!lastSelectedRowId) {
      setSelectionBarTop(null)
      return
    }
    const top = getRowTopWithinTable(lastSelectedRowId)
    if (top == null) {
      setSelectionBarTop(null)
      return
    }
    // Position the bar just above the last selected row
    setSelectionBarTop(Math.max(0, top - 44))
  }

  useLayoutEffect(() => {
    updateSelectionBarPosition()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSelectedRowId, selectedRowIds.size])

  useEffect(() => {
    const onResizeOrScroll = () => updateSelectionBarPosition()
    window.addEventListener('resize', onResizeOrScroll)
    window.addEventListener('scroll', onResizeOrScroll, { passive: true })
    return () => {
      window.removeEventListener('resize', onResizeOrScroll)
      window.removeEventListener('scroll', onResizeOrScroll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSelectedRowId, selectedRowIds.size])

  // When deselecting, re-anchor to the top-most selected row and scroll to it if needed.
  useEffect(() => {
    if (!selectionMode || !lastSelectedRowId) return
    if (lastSelectionActionRef.current !== 'deselect') return

    const rowEl = rowRefs.current[lastSelectedRowId]
    if (!rowEl) return

    const rect = rowEl.getBoundingClientRect()
    const padding = 120
    const above = rect.top < padding
    const below = rect.bottom > window.innerHeight - padding
    if (above || below) {
      // Smoothly bring the anchor row into view
      rowEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [selectionMode, lastSelectedRowId, selectedRowIds.size])

  const toggleRowSelected = (rowId: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev)
      const wasSelected = next.has(rowId)
      if (wasSelected) {
        next.delete(rowId)
        lastSelectionActionRef.current = 'deselect'
        // On deselect: anchor to the TOP-most remaining selected row
        const nextAnchor = getTopmostSelectedRowId(next)
        setLastSelectedRowId(nextAnchor)
      } else {
        next.add(rowId)
        lastSelectionActionRef.current = 'select'
        // On select: anchor to the last selected row (matches your earlier requirement)
        setLastSelectedRowId(rowId)
      }
      return next
    })
  }

  const clearSelection = () => {
    setSelectedRowIds(new Set())
    setLastSelectedRowId(null)
    setSelectionBarTop(null)
  }

  const deleteRowsOptimistic = async (rowIds: string[]) => {
    const prevRows = rowsList || []
    const optimistic = prevRows.filter((r) => !rowIds.includes(r.id))
    await mutate(optimistic, { revalidate: false, populateCache: true })
    clearSelection()

    const results = await Promise.all(
      rowIds.map((id) =>
        fetch(`/api/rows/${id}`, { method: 'DELETE' }).then((r) => ({ ok: r.ok, id }))
      )
    )
    const failed = results.filter((r) => !r.ok).map((r) => r.id)
    if (failed.length) {
      // rollback if any failed
      await mutate(prevRows, { revalidate: false, populateCache: true })
      alert('Failed to delete one or more rows. Please try again.')
    } else {
      void mutate()
    }
  }

  // Initialize widths for new columns, keep existing widths stable
  useEffect(() => {
    setColumnWidths((prev) => {
      const next = { ...prev }
      for (const c of sortedColumns) {
        if (next[c.key] == null) next[c.key] = DEFAULT_COL_WIDTH
      }
      // Remove widths for deleted columns
      for (const key of Object.keys(next)) {
        if (!sortedColumns.some((c) => c.key === key)) delete next[key]
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedColumns.map((c) => c.key).join('|')])

  const clampWidth = (w: number) => Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, w))

  const beginResize = (e: React.PointerEvent, key: string) => {
    if (isColDragActive) return
    e.preventDefault()
    e.stopPropagation()

    const startWidth = columnWidths[key] ?? DEFAULT_COL_WIDTH
    resizeRef.current = { key, startX: e.clientX, startWidth }

    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }

    const prevCursor = document.body.style.cursor
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: PointerEvent) => {
      const state = resizeRef.current
      if (!state) return
      const delta = ev.clientX - state.startX
      const nextWidth = clampWidth(state.startWidth + delta)
      setColumnWidths((prev) => ({ ...prev, [state.key]: nextWidth }))
  }

    const onUp = () => {
      resizeRef.current = null
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const openEditColumn = (column: Column) => setEditColumn(column)

  const saveColumn = async (columnKey: string, next: { label: string; desc: string }) => {
    if (isSavingColumn) return
    const prevColumns = columns
    const col = prevColumns.find((c) => c.key === columnKey)
    if (!col) return
    const nextLabel = next.label.trim()
    const nextDesc = next.desc.trim()
    if (!nextLabel || !nextDesc) return
    if (nextLabel === col.label && nextDesc === col.desc) return

    setIsSavingColumn(true)

    const optimistic = prevColumns.map((c) =>
      c.key === columnKey ? { ...c, label: nextLabel, desc: nextDesc, key: c.key } : c
    )

    // Optimistic UI update (no flicker)
    if (onColumnsChange) onColumnsChange(optimistic)
    setEditColumn(null)

    try {
      const res = await fetch(`/api/tables/${tableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns: optimistic }),
      })
      if (!res.ok) throw new Error('Failed to update column')
      if (!onColumnsChange) window.location.reload()
    } catch (e) {
      // rollback
      if (onColumnsChange) onColumnsChange(prevColumns)
      setEditColumn({ ...col, label: nextLabel, desc: nextDesc })
      alert('Failed to update column. Please try again.')
    } finally {
      setIsSavingColumn(false)
    }
  }

  const startEditingCell = (rowId: string, columnKey: string, currentValue: string | number | null) => {
    setEditingCell({ rowId, columnKey })
    setEditingValue(currentValue === null || currentValue === '' ? '' : String(currentValue))
  }

  useEffect(() => {
    if (textareaRef.current && editingCell) {
      // Auto-resize textarea on mount and value change
      const textarea = textareaRef.current
      textarea.style.height = 'auto'
      textarea.style.height = textarea.scrollHeight + 'px'
    }
  }, [editingValue, editingCell])

  // Handle click outside to save immediately
  useEffect(() => {
    if (!editingCell) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Check if click is outside the textarea and not on the edit button
      if (
        textareaRef.current && 
        !textareaRef.current.contains(target) &&
        !target.closest('button[title="Edit cell"]')
      ) {
        // Get current value directly from textarea
        const currentValue = textareaRef.current.value
        // Save immediately with current textarea value
        saveCell(editingCell.rowId, editingCell.columnKey, currentValue)
      }
    }

    // Use mousedown instead of click for faster response
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
  }
  }, [editingCell, rowsList])

  const cancelEditingCell = () => {
    setEditingCell(null)
    setEditingValue('')
  }

  const saveCell = async (rowId: string, columnKey: string, valueToSave?: string) => {
    if (isSaving) return // Prevent double saves

    const value = valueToSave !== undefined ? valueToSave : editingValue

    // If nothing changed, just exit edit mode immediately (no flicker, no network)
    const currentRow = rowsList?.find((r) => r.id === rowId)
    const previousValue =
      currentRow?.data?.[columnKey] === null || currentRow?.data?.[columnKey] === undefined
        ? ''
        : String(currentRow.data[columnKey])
    if ((value || '') === previousValue) {
      setEditingCell(null)
      setEditingValue('')
      return
    }

    setIsSaving(true)

    // Build optimistic cache update so UI never flashes old value
    const prevRows = rowsList || []
    const optimisticRows = prevRows.map((r) => {
      if (r.id !== rowId) return r
      return {
        ...r,
        data: {
          ...r.data,
          [columnKey]: value || null,
        },
      }
    })

    // Update UI immediately before leaving edit mode
    await mutate(optimisticRows, { revalidate: false, populateCache: true })
    setEditingCell(null)
    setEditingValue('')

    try {
      if (!currentRow) return

      const updatedData = {
        ...currentRow.data,
        [columnKey]: value || null,
      }

      const response = await fetch(`/api/rows/${rowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: updatedData }),
      })

      if (!response.ok) {
        throw new Error('Failed to save cell')
      }

      // Revalidate in the background to keep cache consistent (should not flicker due to optimistic cache)
      void mutate()

      window.dispatchEvent(
        new CustomEvent('pdf-tables:table-touched', {
          detail: { tableId, updated_at: new Date().toISOString() },
        })
      )
    } catch (err) {
      // Rollback cache (still seamless) + re-open editor
      await mutate(prevRows, { revalidate: false, populateCache: true })
      setEditingCell({ rowId, columnKey })
      setEditingValue(value)
      alert('Failed to save changes. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddColumn = async (label: string, desc: string) => {
    const key = generateVariableKey(label)
    const newOrder = columns.length > 0 ? Math.max(...columns.map(c => c.order)) + 1 : 0
    
    const newColumn: Column = {
      label,
      key,
      desc,
      order: newOrder,
    }

    const updatedColumns = [...columns, newColumn].sort((a, b) => a.order - b.order)

    try {
      const response = await fetch(`/api/tables/${tableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns: updatedColumns }),
      })

      if (!response.ok) {
        throw new Error('Failed to add column')
      }

      if (onColumnsChange) {
        onColumnsChange(updatedColumns)
      } else {
        window.location.reload()
      }

      window.dispatchEvent(
        new CustomEvent('pdf-tables:table-touched', {
          detail: { tableId, updated_at: new Date().toISOString() },
        })
      )
    } catch (err) {
      console.error('Failed to add column:', err)
      alert('Failed to add column. Please try again.')
    }
  }

  const handleDeleteColumn = async (columnKey: string) => {
    const prevColumns = columns
    const updatedColumns = columns.filter((c) => c.key !== columnKey)

    // Optimistic update
    if (onColumnsChange) onColumnsChange(updatedColumns)
    setConfirmDeleteColumnKey(null)

    setIsDeletingColumn(true)
    try {
      const response = await fetch(`/api/tables/${tableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns: updatedColumns }),
      })

      if (!response.ok) {
        throw new Error('Failed to delete column')
      }
      if (!onColumnsChange) window.location.reload()

      window.dispatchEvent(
        new CustomEvent('pdf-tables:table-touched', {
          detail: { tableId, updated_at: new Date().toISOString() },
        })
      )
    } catch (err) {
      console.error('Failed to delete column:', err)
      if (onColumnsChange) onColumnsChange(prevColumns)
      alert('Failed to delete column. Please try again.')
    } finally {
      setIsDeletingColumn(false)
    }
  }


  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive">
        Error loading rows: {error.message || 'Unknown error'}
      </div>
    )
  }

  // If SWR cache contains a non-array, show a safe error state instead of crashing.
  if (rows && !Array.isArray(rows)) {
    const msg =
      typeof (rows as any)?.error === 'string'
        ? (rows as any).error
        : 'Unexpected response. Please refresh the page.'
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive">
        Error loading rows: {msg}
      </div>
    )
  }

  if (!rowsList) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-muted animate-pulse rounded"></div>
        ))}
      </div>
    )
  }

  const existingKeys = columns.map(c => c.key)

  // Handle empty columns case
  if (columns.length === 0) {
    return (
      <>
        {/* No table chrome/lines until at least one custom column exists */}
        <div className="pl-[100px] pr-8">
          <div className="mt-3">
            <AddColumnButton onClick={() => setIsAddColumnOpen(true)} />
          </div>
        </div>
        <div className="mt-10 px-8 text-center text-muted-foreground">
          <p>No columns yet. Click &quot;Add Column&quot; to get started.</p>
        </div>
        <AddColumnModal
          isOpen={isAddColumnOpen}
          onClose={() => setIsAddColumnOpen(false)}
          onAdd={handleAddColumn}
          existingKeys={existingKeys}
        />
        <EditColumnModal
          isOpen={editColumn !== null}
          column={editColumn}
          onClose={() => setEditColumn(null)}
          onSave={(next) => {
            if (editColumn) void saveColumn(editColumn.key, next)
          }}
        />
        <ConfirmDialog
          open={confirmDeleteColumnKey !== null}
          title="Delete column?"
          description="This will remove the column from the table. Existing extracted data will remain in the database but will no longer be shown."
          confirmText="Delete"
          cancelText="Cancel"
          destructive
          isLoading={isDeletingColumn}
          onCancel={() => setConfirmDeleteColumnKey(null)}
          onConfirm={() => {
            if (confirmDeleteColumnKey) void handleDeleteColumn(confirmDeleteColumnKey)
          }}
        />
      </>
    )
  }

  if (rowsList.length === 0) {
    return (
      <>
        <div className="border border-border border-x-0 border-t-0 border-b-0 rounded-b-lg rounded-t-none overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-max">
              {/* Header: matches main table shell */}
              <div className="bg-background">
                <div className="flex">
                  <div className="flex-shrink-0 w-24 px-3 py-2" />

                  <div className="flex border-t border-border border-b-2 border-border pl-3">
                    {headerColumns.map((column) => (
                      <div
                        key={column.key}
                        ref={(el) => {
                          colHeaderRefs.current[column.key] = el
                        }}
                        className={[
                          'flex-shrink-0 px-3 py-2 border-r border-border relative group/colhead cell-hover-fade transition-colors hover:bg-muted/30',
                          draggingColKey === column.key
                            ? colDragHasMoved
                              ? 'opacity-0 pointer-events-none select-none'
                              : 'opacity-60'
                            : '',
                        ].join(' ')}
                        style={{
                          ['--fade-cutoff' as any]: '52px',
                          width: `${columnWidths[column.key] ?? DEFAULT_COL_WIDTH}px`,
                          cursor: draggingColKey === column.key ? 'grabbing' : 'default',
                        }}
                        onPointerDown={(e) => beginColumnDrag(column.key, e)}
                      >
                        <div className="relative w-full">
                          <div
                            className="cell-text text-sm font-semibold text-foreground truncate pr-10"
                            style={{ lineHeight: '1.5rem', padding: 0, margin: 0 }}
                          >
                            {column.label}
                          </div>

                          <div className="absolute top-[2px] right-1 flex gap-1 opacity-0 group-hover/colhead:opacity-100 transition-opacity pt-0.5">
                            <button
                              type="button"
                              onClick={() => openEditColumn(column)}
                              className="p-0.5 text-muted-foreground hover:text-foreground rounded"
                              title="Edit column"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteColumnKey(column.key)}
                              className="p-0.5 text-muted-foreground hover:text-destructive rounded"
                              title="Delete column"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* resize handle */}
                        <div
                          className="absolute top-0 right-[-3px] h-full w-[8px] cursor-col-resize"
                          data-resize-handle="true"
                          style={{ touchAction: 'none' }}
                          onPointerDown={(e) => beginResize(e, column.key)}
                          title="Resize column"
                        >
                          <div className="absolute inset-y-0 left-1/2 w-px bg-transparent group-hover/colhead:bg-border" />
                        </div>
                      </div>
                    ))}
                    <div className="flex-shrink-0 w-[120px] px-3 py-2 border-l border-border">
                      <span className="text-sm font-medium text-foreground">PDF</span>
                    </div>
                  </div>

                  {/* Add Column area (borderless) */}
                  <div className="flex-shrink-0 px-3 py-2">
                    <AddColumnButton onClick={() => setIsAddColumnOpen(true)} />
                  </div>
                </div>
              </div>

              <div className="bg-background p-12 text-center text-muted-foreground">
                <p>No rows yet. Upload a PDF to create your first row.</p>
              </div>
            </div>
          </div>
        </div>
        <AddColumnModal
          isOpen={isAddColumnOpen}
          onClose={() => setIsAddColumnOpen(false)}
          onAdd={handleAddColumn}
          existingKeys={existingKeys}
        />
        <EditColumnModal
          isOpen={editColumn !== null}
          column={editColumn}
          onClose={() => setEditColumn(null)}
          onSave={(next) => {
            if (editColumn) void saveColumn(editColumn.key, next)
          }}
        />
        <ConfirmDialog
          open={confirmDeleteColumnKey !== null}
          title="Delete column?"
          description="This will remove the column from the table. Existing extracted data will remain in the database but will no longer be shown."
          confirmText="Delete"
          cancelText="Cancel"
          destructive
          isLoading={isDeletingColumn}
          onCancel={() => setConfirmDeleteColumnKey(null)}
          onConfirm={() => {
            if (confirmDeleteColumnKey) void handleDeleteColumn(confirmDeleteColumnKey)
          }}
        />
      </>
    )
  }

  return (
    <>
      {/* Floating drag ghost (visual only) */}
      {ghostRow && dragGhostRect && dragPointer && dragGhostOffsetRef.current && (
        <div
          className="pointer-events-none fixed z-[100] rounded-lg border border-border bg-card/80 text-card-foreground shadow-lg backdrop-blur-md"
          style={{
            left: dragGhostRect.left,
            top: dragPointer.y - dragGhostOffsetRef.current.y,
            width: dragGhostRect.width,
            height: dragGhostRect.height,
            opacity: 0.7,
            transform: 'translateZ(0)',
          }}
        >
          {/* Simple read-only preview of the row */}
          <div className="flex h-full">
            <div className="flex-shrink-0 w-24 px-3 flex items-center" />
            <div className="flex pl-3 flex-1">
              {bodyColumns.map((column) => {
                const value = ghostRow.data?.[column.key] ?? null
                const displayValue = value === null || value === '' ? '—' : String(value)
                return (
                  <div
                    key={column.key}
                    className="flex-shrink-0 px-3 py-2 border-r border-border"
                    style={{
                      width: `${columnWidths[column.key] ?? DEFAULT_COL_WIDTH}px`,
                    }}
                  >
                    <div className="text-sm text-foreground truncate" style={{ lineHeight: '1.5rem' }}>
                      {displayValue}
                    </div>
                  </div>
                )
              })}
              <div className="flex-shrink-0 w-[120px] px-3 py-2 border-l border-border flex items-center">
                <div className="scale-[0.92] origin-left">
                  <PdfThumbnailCell
                    thumbnailUrl={ghostRow.thumbnail_url}
                    pdfUrl={ghostRow.pdf_url}
                    filename={`row-${ghostRow.id}.pdf`}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating column ghost (visual only) */}
      {ghostColumn && colGhostRect && colDragPointer && colGhostOffsetRef.current && (
        <div
          className="pointer-events-none fixed z-[110] rounded-md border border-border bg-card/80 text-card-foreground shadow-lg backdrop-blur-md"
          style={{
            left: colDragPointer.x - colGhostOffsetRef.current.x,
            top: colGhostRect.top,
            width: colGhostRect.width,
            height: colGhostRect.height,
            opacity: 0.75,
            transform: 'translateZ(0)',
          }}
        >
          <div className="h-full px-3 py-2 flex items-center">
            <div className="text-sm font-semibold text-foreground truncate">{ghostColumn.label}</div>
          </div>
        </div>
      )}

      <div ref={tableWrapRef} className="relative">
        {/* Remove left/right outer borders (only top/bottom border) */}
        <div className="border border-border border-x-0 border-t-0 border-b-0 rounded-b-lg rounded-t-none overflow-hidden">
    <div className="overflow-x-auto">
            <div className="min-w-max">
              {/* Header: gutter has NO borders; table header has top+bottom borders */}
              <div className="bg-background">
                <div className="flex">
                  {/* Invisible gutter column for row controls (keeps hover area inside table) */}
                  <div className="flex-shrink-0 w-24 px-3 py-2" />

                  {/* Header content (adds spacing before first column + draws borders). ENDS at PDF. */}
                  <div className="flex border-t border-border border-b-2 border-border pl-3">
            {headerColumns.map((column) => (
                      <div
                key={column.key}
                        ref={(el) => {
                          colHeaderRefs.current[column.key] = el
                        }}
                        className={[
                          'flex-shrink-0 px-3 py-2 border-r border-border relative group/colhead cell-hover-fade transition-colors hover:bg-muted/30',
                          draggingColKey === column.key
                            ? colDragHasMoved
                              ? 'opacity-0 pointer-events-none select-none'
                              : 'opacity-60'
                            : '',
                        ].join(' ')}
                        style={{
                          ['--fade-cutoff' as any]: '52px',
                          width: `${columnWidths[column.key] ?? DEFAULT_COL_WIDTH}px`,
                          cursor: draggingColKey === column.key ? 'grabbing' : 'default',
                        }}
                        onPointerDown={(e) => beginColumnDrag(column.key, e)}
                      >
                        <div className="relative w-full">
                          <div
                            className="cell-text text-sm font-semibold text-foreground truncate pr-10"
                            style={{ lineHeight: '1.5rem', padding: 0, margin: 0 }}
              >
                {column.label}
                          </div>

                          <div className="absolute top-[2px] right-1 flex gap-1 opacity-0 group-hover/colhead:opacity-100 transition-opacity pt-0.5">
                            <button
                              type="button"
                              onClick={() => openEditColumn(column)}
                              className="p-0.5 text-muted-foreground hover:text-foreground rounded"
                              title="Edit column"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteColumnKey(column.key)}
                              className="p-0.5 text-muted-foreground hover:text-destructive rounded"
                              title="Delete column"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* resize handle */}
                        <div
                          className="absolute top-0 right-[-3px] h-full w-[8px] cursor-col-resize"
                          data-resize-handle="true"
                          style={{ touchAction: 'none' }}
                          onPointerDown={(e) => beginResize(e, column.key)}
                          title="Resize column"
                        >
                          <div className="absolute inset-y-0 left-1/2 w-px bg-transparent group-hover/colhead:bg-border" />
                        </div>
                      </div>
                    ))}
                    <div className="flex-shrink-0 w-[120px] px-3 py-2 border-l border-border">
                      <span className="text-sm font-medium text-foreground">PDF</span>
                    </div>
                  </div>

                  {/* Add Column "column" (intentionally borderless; no top/bottom borders) */}
                  <div className="flex-shrink-0 px-3 py-2">
                    <AddColumnButton onClick={() => setIsAddColumnOpen(true)} />
                  </div>
                </div>
              </div>
              <div ref={rowsContainerRef} className="relative bg-background">
            {/* Selection toolbar (appears when rows selected) */}
            {selectionMode && selectionBarTop !== null && (
              <div
                    className="absolute left-3 z-20"
                style={{ top: selectionBarTop }}
              >
                <div className="flex items-center gap-3 bg-card border border-border shadow-sm rounded-md px-3 py-2">
                  <span className="text-sm text-foreground font-medium">
                    {selectedRowIds.size} selected
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteRowsOpen(true)}
                    className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors rounded"
                    title="Delete selected"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0V5a2 2 0 012-2h2a2 2 0 012 2v2" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {displayRows.map((row, rowIdx) => {
            const isSelected = selectedRowIds.has(row.id)
            return (
                <div
                  key={row.id}
                  ref={(el) => {
                    rowRefs.current[row.id] = el
                  }}
                  className={[
                    'group/row flex relative transition-colors duration-150 ease-out',
                    isSelected ? 'bg-primary/10' : 'bg-background',
                    // While dragging, the dragged row becomes an invisible placeholder gap.
                    draggingRowId === row.id
                      ? dragHasMoved
                        ? 'opacity-0 pointer-events-none select-none'
                        : 'opacity-50'
                      : '',
                  ].join(' ')}
                >
                      {/* Invisible gutter column (row controls live here; not a real data column) */}
                      <div className="flex-shrink-0 w-24 px-3 flex items-center">
                        <div
                          className={`transition-opacity flex items-center gap-2 ${
                            selectionMode || isSelected
                              ? 'opacity-100'
                              : isDragActive
                                ? 'opacity-60'
                                : 'opacity-0 group-hover/row:opacity-100'
                          }`}
                        >
                          {/* Drag handle (hidden in selection mode) */}
                          {!selectionMode && (
                            <button
                              type="button"
                              onPointerDown={(e) => beginRowDrag(row.id, e)}
                              className={`text-muted-foreground/50 select-none ${
                                isDragActive ? 'opacity-80' : 'hover:text-muted-foreground'
                              }`}
                              title="Drag to reorder"
                              style={{
                                touchAction: 'none',
                                cursor: draggingRowId === row.id ? 'grabbing' : 'grab',
                              }}
                            >
                            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M7 4a1 1 0 110 2 1 1 0 010-2zm0 5a1 1 0 110 2 1 1 0 010-2zm0 5a1 1 0 110 2 1 1 0 010-2zm6-10a1 1 0 110 2 1 1 0 010-2zm0 5a1 1 0 110 2 1 1 0 010-2zm0 5a1 1 0 110 2 1 1 0 010-2z" />
                            </svg>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => toggleRowSelected(row.id)}
                            title="Select row"
                            className={isDragActive ? 'pointer-events-none opacity-60' : ''}
                          >
                            <div
                              className={`w-4 h-4 rounded border ring-1 ring-inset ${
                                isSelected
                                  ? 'bg-primary border-primary ring-primary/30 shadow-sm'
                                  : 'border-foreground/25 bg-card/60 ring-border/60 hover:bg-card'
                              } flex items-center justify-center transition-colors`}
                            >
                              {isSelected && (
                                <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8.5 8.5a1 1 0 01-1.414 0l-3.5-3.5a1 1 0 011.414-1.414L7.5 13.086l7.793-7.793a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                          </button>

                          {!selectionMode && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteSingleRowId(row.id)}
                              className={`p-1 -ml-1 text-muted-foreground transition-colors rounded ${
                                isDragActive ? 'opacity-50 pointer-events-none' : 'hover:text-destructive hover:bg-destructive/10'
                              }`}
                              title="Delete row"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0V5a2 2 0 012-2h2a2 2 0 012 2v2" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Row separators: only on the "real table" area, not under the gutter */}
                      <div className={`flex pl-3 ${rowIdx === 0 ? '' : 'border-t border-border'}`}>
                {bodyColumns.map((column) => {
                  const value = row.data[column.key] ?? null
                  const displayValue = value === null || value === '' ? '—' : String(value)
                    const isEditing = editingCell?.rowId === row.id && editingCell?.columnKey === column.key

                  return (
                      <div
                        key={column.key}
                        ref={(el) => {
                          if (!colCellRefs.current[row.id]) colCellRefs.current[row.id] = {}
                          colCellRefs.current[row.id][column.key] = el
                        }}
                        className={`flex-shrink-0 px-3 py-2 border-r border-border relative group/cell ${
                          isDragActive ? '' : 'cell-hover-fade'
                        }`}
                        style={{
                          ['--fade-cutoff' as any]: '28px',
                          width: `${columnWidths[column.key] ?? DEFAULT_COL_WIDTH}px`,
                        }}
                      >
                      {isEditing ? (
                          <textarea
                            ref={textareaRef}
                            value={editingValue}
                            onChange={(e) => {
                              setEditingValue(e.target.value)
                              // Auto-resize textarea
                              const textarea = e.target
                              textarea.style.height = 'auto'
                              textarea.style.height = textarea.scrollHeight + 'px'
                            }}
                            onBlur={() => {
                              // Save on blur (click-outside will handle clicks elsewhere)
                              saveCell(row.id, column.key)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                e.currentTarget.blur()
                              } else if (e.key === 'Escape') {
                                cancelEditingCell()
                              }
                            }}
                            autoFocus
                            className="w-full text-sm bg-transparent border-none focus:outline-none focus:ring-0 resize-none overflow-hidden p-0 m-0"
                          placeholder="—"
                            rows={1}
                            style={{ minHeight: '1.5rem', lineHeight: '1.5rem', padding: 0, margin: 0 }}
                        />
                      ) : (
                          <div className="relative w-full">
                            <div
                              className="cell-text text-sm text-foreground pr-6 min-h-[1.5rem] overflow-x-auto scrollbar-hide whitespace-pre-wrap break-words"
                              style={{ lineHeight: '1.5rem', padding: 0, margin: 0 }}
                        >
                              {displayValue}
                            </div>
                        <button
                              onClick={() => startEditingCell(row.id, column.key, value)}
                              className={`absolute top-[2px] right-0 p-0.5 opacity-0 ${
                                isDragActive ? '' : 'group-hover/cell:opacity-100 hover:text-foreground'
                              } text-muted-foreground transition-opacity flex-shrink-0 z-10 bg-background rounded ${
                                isDragActive ? 'pointer-events-none' : ''
                              }`}
                              title="Edit cell"
                        >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                        </button>
                          </div>
                    )}
                  </div>
                    )
                  })}
                  <div className="flex-shrink-0 w-[120px] px-3 py-2 border-l border-border flex items-center">
                  <PdfThumbnailCell
                    thumbnailUrl={row.thumbnail_url}
                    pdfUrl={row.pdf_url}
                    filename={`row-${row.id}.pdf`}
                  />
                  </div>
                      </div>
                </div>
            )
          })}
              </div>
            </div>
          </div>
        </div>
    </div>
      <AddColumnModal
        isOpen={isAddColumnOpen}
        onClose={() => setIsAddColumnOpen(false)}
        onAdd={handleAddColumn}
        existingKeys={existingKeys}
      />
      <EditColumnModal
        isOpen={editColumn !== null}
        column={editColumn}
        onClose={() => setEditColumn(null)}
        onSave={(next) => {
          if (editColumn) void saveColumn(editColumn.key, next)
        }}
      />
      <ConfirmDialog
        open={confirmDeleteColumnKey !== null}
        title="Delete column?"
        description="This will remove the column from the table. Existing extracted data will remain in the database but will no longer be shown."
        confirmText="Delete"
        cancelText="Cancel"
        destructive
        isLoading={isDeletingColumn}
        onCancel={() => setConfirmDeleteColumnKey(null)}
        onConfirm={() => {
          if (confirmDeleteColumnKey) void handleDeleteColumn(confirmDeleteColumnKey)
        }}
      />
      <ConfirmDialog
        open={confirmDeleteRowsOpen}
        title={`Delete ${selectedRowIds.size} row${selectedRowIds.size === 1 ? '' : 's'}?`}
        description="This will permanently delete the selected rows."
        confirmText="Delete"
        cancelText="Cancel"
        destructive
        onCancel={() => setConfirmDeleteRowsOpen(false)}
        onConfirm={() => {
          setConfirmDeleteRowsOpen(false)
          void deleteRowsOptimistic(Array.from(selectedRowIds))
        }}
      />
      <ConfirmDialog
        open={confirmDeleteSingleRowId !== null}
        title="Delete row?"
        description="This will permanently delete this row."
        confirmText="Delete"
        cancelText="Cancel"
        destructive
        onCancel={() => setConfirmDeleteSingleRowId(null)}
        onConfirm={() => {
          const id = confirmDeleteSingleRowId
          setConfirmDeleteSingleRowId(null)
          if (id) void deleteRowsOptimistic([id])
        }}
      />
    </>
  )
}

