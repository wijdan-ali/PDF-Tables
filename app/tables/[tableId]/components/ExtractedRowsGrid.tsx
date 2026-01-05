'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import useSWR from 'swr'
import PdfThumbnailCell from './PdfThumbnailCell'
import AddColumnModal from '@/app/components/AddColumnModal'
import ConfirmDialog from '@/app/components/ConfirmDialog'
import EditColumnModal from '@/app/components/EditColumnModal'
import { generateVariableKey } from '@/lib/utils/slugify'
import type { Column, ExtractedRow } from '@/types/api'

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

export default function ExtractedRowsGrid({ tableId, columns, onColumnsChange }: ExtractedRowsGridProps) {
  const [editingCell, setEditingCell] = useState<{ rowId: string; columnKey: string } | null>(null)
  const [editingValue, setEditingValue] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)
  const [isAddColumnOpen, setIsAddColumnOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const rowsContainerRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const tableWrapRef = useRef<HTMLDivElement>(null)

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
  const [dropIndicatorId, setDropIndicatorId] = useState<string | null>(null)

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
      isPaused: () => isSaving || editingCell !== null || selectionMode || draggingRowId !== null,
    }
  )

  const sortedColumns = [...columns].sort((a, b) => a.order - b.order)

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

  // SWR cache can briefly contain non-array data (e.g. prior fetcher returned an error object).
  // Guard all row list ops to avoid runtime crashes.
  const rowsList: ExtractedRow[] | null = Array.isArray(rows) ? (rows as ExtractedRow[]) : null
  const hasServerRowOrder = !!rowsList?.some((r) => typeof r.row_order === 'number')
  const [pendingOrderIds, setPendingOrderIds] = useState<string[] | null>(null)
  const isDragActive = draggingRowId !== null

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
    setDropIndicatorId(null)
  }

  useEffect(() => {
    if (!draggingRowId || !dragOrder) return

    const onMove = (ev: PointerEvent) => {
      if (dragPointerIdRef.current != null && ev.pointerId !== dragPointerIdRef.current) return
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
      const nextIds = moveItem(ids, fromIndex, toIndex)
      setDragOrder(nextIds)
      setDropIndicatorId(nextIds[toIndex] ?? null)
    }

    const onUp = async (ev: PointerEvent) => {
      if (dragPointerIdRef.current != null && ev.pointerId !== dragPointerIdRef.current) return
      dragPointerIdRef.current = null

      const finalOrder = dragOrder
      const movedId = draggingRowId

      setDraggingRowId(null)
      setDragOrder(null)
      setDropIndicatorId(null)
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
      <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
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
      <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
        Error loading rows: {msg}
      </div>
    )
  }

  if (!rowsList) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-100 animate-pulse rounded"></div>
        ))}
      </div>
    )
  }

  const existingKeys = columns.map(c => c.key)

  // Handle empty columns case
  if (columns.length === 0) {
    return (
      <>
        <div className="border border-gray-200 border-x-0 border-t-0 border-b-0 rounded-b-lg rounded-t-none overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-max">
              {/* Header: gutter has NO borders; table header has top+bottom borders; ends at PDF */}
              <div className="bg-white">
                <div className="flex">
                  <div className="flex-shrink-0 w-24 px-3 py-2" />

                  <div className="flex border-t border-gray-200 border-b-2 border-gray-300 pl-3">
                    <div className="flex-shrink-0 w-[120px] px-3 py-2 border-l border-gray-200">
                      <span className="text-sm font-medium text-gray-700">PDF</span>
                    </div>
                  </div>

                  {/* Add Column area (borderless) */}
                  <div className="flex-shrink-0 px-3 py-2">
                    <button
                      onClick={() => setIsAddColumnOpen(true)}
                      className="text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-2 py-1 rounded transition-colors flex items-center gap-1"
                    >
                      <span>+</span>
                      <span>Add Column</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white p-12 text-center text-gray-500">
                <p>No columns yet. Click "Add Column" to get started.</p>
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
        <div className="border border-gray-200 border-x-0 border-t-0 border-b-0 rounded-b-lg rounded-t-none overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-max">
              {/* Header: matches main table shell */}
              <div className="bg-white">
                <div className="flex">
                  <div className="flex-shrink-0 w-24 px-3 py-2" />

                  <div className="flex border-t border-gray-200 border-b-2 border-gray-300 pl-3">
                    {sortedColumns.map((column) => (
                      <div
                        key={column.key}
                        className="flex-shrink-0 px-3 py-2 border-r border-gray-200 relative group/colhead cell-hover-fade"
                        style={{
                          ['--fade-cutoff' as any]: '52px',
                          width: `${columnWidths[column.key] ?? DEFAULT_COL_WIDTH}px`,
                        }}
                      >
                        <div className="relative w-full">
                          <div
                            className="cell-text text-sm font-semibold text-gray-900 truncate pr-10"
                            style={{ lineHeight: '1.5rem', padding: 0, margin: 0 }}
                          >
                            {column.label}
                          </div>

                          <div className="absolute top-[2px] right-1 flex gap-1 opacity-0 group-hover/colhead:opacity-100 transition-opacity pt-0.5">
                            <button
                              type="button"
                              onClick={() => openEditColumn(column)}
                              className="p-0.5 text-gray-400 hover:text-gray-600 rounded"
                              title="Edit column"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteColumnKey(column.key)}
                              className="p-0.5 text-gray-400 hover:text-red-600 rounded"
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
                          style={{ touchAction: 'none' }}
                          onPointerDown={(e) => beginResize(e, column.key)}
                          title="Resize column"
                        >
                          <div className="absolute inset-y-0 left-1/2 w-px bg-transparent group-hover/colhead:bg-gray-300" />
                        </div>
                      </div>
                    ))}
                    <div className="flex-shrink-0 w-[120px] px-3 py-2 border-l border-gray-200">
                      <span className="text-sm font-medium text-gray-700">PDF</span>
                    </div>
                  </div>

                  {/* Add Column area (borderless) */}
                  <div className="flex-shrink-0 px-3 py-2">
                    <button
                      onClick={() => setIsAddColumnOpen(true)}
                      className="text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-2 py-1 rounded transition-colors flex items-center gap-1"
                    >
                      <span>+</span>
                      <span>Add Column</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white p-12 text-center text-gray-500">
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
      <div ref={tableWrapRef} className="relative">
        {/* Remove left/right outer borders (only top/bottom border) */}
        <div className="border border-gray-200 border-x-0 border-t-0 border-b-0 rounded-b-lg rounded-t-none overflow-hidden">
    <div className="overflow-x-auto">
            <div className="min-w-max">
              {/* Header: gutter has NO borders; table header has top+bottom borders */}
              <div className="bg-white">
                <div className="flex">
                  {/* Invisible gutter column for row controls (keeps hover area inside table) */}
                  <div className="flex-shrink-0 w-24 px-3 py-2" />

                  {/* Header content (adds spacing before first column + draws borders). ENDS at PDF. */}
                  <div className="flex border-t border-gray-200 border-b-2 border-gray-300 pl-3">
            {sortedColumns.map((column) => (
                      <div
                key={column.key}
                        className="flex-shrink-0 px-3 py-2 border-r border-gray-200 relative group/colhead cell-hover-fade"
                        style={{
                          ['--fade-cutoff' as any]: '52px',
                          width: `${columnWidths[column.key] ?? DEFAULT_COL_WIDTH}px`,
                        }}
                      >
                        <div className="relative w-full">
                          <div
                            className="cell-text text-sm font-semibold text-gray-900 truncate pr-10"
                            style={{ lineHeight: '1.5rem', padding: 0, margin: 0 }}
              >
                {column.label}
                          </div>

                          <div className="absolute top-[2px] right-1 flex gap-1 opacity-0 group-hover/colhead:opacity-100 transition-opacity pt-0.5">
                            <button
                              type="button"
                              onClick={() => openEditColumn(column)}
                              className="p-0.5 text-gray-400 hover:text-gray-600 rounded"
                              title="Edit column"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteColumnKey(column.key)}
                              className="p-0.5 text-gray-400 hover:text-red-600 rounded"
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
                          style={{ touchAction: 'none' }}
                          onPointerDown={(e) => beginResize(e, column.key)}
                          title="Resize column"
                        >
                          <div className="absolute inset-y-0 left-1/2 w-px bg-transparent group-hover/colhead:bg-gray-300" />
                        </div>
                      </div>
                    ))}
                    <div className="flex-shrink-0 w-[120px] px-3 py-2 border-l border-gray-200">
                      <span className="text-sm font-medium text-gray-700">PDF</span>
                    </div>
                  </div>

                  {/* Add Column "column" (intentionally borderless; no top/bottom borders) */}
                  <div className="flex-shrink-0 px-3 py-2">
                    <button
                      onClick={() => setIsAddColumnOpen(true)}
                      className="text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-2 py-1 rounded transition-colors flex items-center gap-1"
                    >
                      <span>+</span>
                      <span>Add Column</span>
                    </button>
                  </div>
                </div>
              </div>
              <div ref={rowsContainerRef} className="relative bg-white">
            {/* Selection toolbar (appears when rows selected) */}
            {selectionMode && selectionBarTop !== null && (
              <div
                    className="absolute left-3 z-20"
                style={{ top: selectionBarTop }}
              >
                <div className="flex items-center gap-3 bg-white border border-gray-200 shadow-sm rounded-md px-3 py-2">
                  <span className="text-sm text-gray-700 font-medium">
                    {selectedRowIds.size} selected
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteRowsOpen(true)}
                        className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors rounded"
                    title="Delete selected"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0V5a2 2 0 012-2h2a2 2 0 012 2v2" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-sm text-gray-500 hover:text-gray-700"
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
                  className={`group/row flex relative transition-[transform,box-shadow,background-color] duration-200 ease-in-out ${
                    isSelected ? 'bg-blue-50' : 'bg-white'
                  } ${draggingRowId === row.id ? 'shadow-xl ring-2 ring-blue-300 bg-white' : ''}`}
                  style={{
                    transform:
                      draggingRowId === row.id
                        ? 'scale(1.02) translateZ(0) rotate(-0.2deg)'
                        : 'translateZ(0)',
                    opacity: draggingRowId === row.id ? 0.8 : 1,
                    willChange: draggingRowId ? 'transform, box-shadow' : undefined,
                    cursor: draggingRowId === row.id ? 'grabbing' : draggingRowId ? 'grabbing' : undefined,
                  }}
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
                              className={`text-gray-300 select-none ${
                                isDragActive ? 'opacity-80' : 'hover:text-gray-400'
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
                            <div className={`w-4 h-4 rounded border ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'} flex items-center justify-center`}>
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
                              className={`p-1 -ml-1 text-gray-400 transition-colors rounded ${
                                isDragActive ? 'opacity-50 pointer-events-none' : 'hover:text-red-600 hover:bg-red-50'
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
                      <div
                        className={`flex pl-3 ${rowIdx === 0 ? '' : 'border-t border-gray-200'}`}
                      >
                        {dropIndicatorId === row.id && draggingRowId !== row.id && (
                          <div className="absolute left-2 right-2 -top-[8px] h-2 rounded-full bg-gradient-to-r from-blue-400 via-blue-500 to-blue-400 shadow-md pointer-events-none" />
                        )}
                {sortedColumns.map((column) => {
                  const value = row.data[column.key] ?? null
                  const displayValue = value === null || value === '' ? '—' : String(value)
                    const isEditing = editingCell?.rowId === row.id && editingCell?.columnKey === column.key

                  return (
                      <div
                        key={column.key}
                        className={`flex-shrink-0 px-3 py-2 border-r border-gray-200 relative group/cell ${
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
                              className="cell-text text-sm text-gray-900 pr-6 min-h-[1.5rem] overflow-x-auto scrollbar-hide whitespace-pre-wrap break-words"
                              style={{ lineHeight: '1.5rem', padding: 0, margin: 0 }}
                        >
                              {displayValue}
                            </div>
                        <button
                              onClick={() => startEditingCell(row.id, column.key, value)}
                              className={`absolute top-[2px] right-0 p-0.5 opacity-0 ${
                                isDragActive ? '' : 'group-hover/cell:opacity-100 hover:text-gray-600'
                              } text-gray-400 transition-opacity flex-shrink-0 z-10 bg-white rounded ${
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
                  <div className="flex-shrink-0 w-[120px] px-3 py-2 border-l border-gray-200 flex items-center">
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

