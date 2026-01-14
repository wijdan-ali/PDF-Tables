'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ExtractedRow } from '@/types/api'
import { rowOrderStorageKey } from '@/lib/constants/storage'

export function usePersistedRowOrder({
  tableId,
  rows,
  dragOrder,
  pendingOrderIds,
  setPendingOrderIds,
}: {
  tableId: string
  rows: ExtractedRow[] | undefined
  dragOrder: string[] | null
  pendingOrderIds: string[] | null
  setPendingOrderIds: (next: string[] | null) => void
}) {
  const rowsList: ExtractedRow[] | null = Array.isArray(rows) ? (rows as ExtractedRow[]) : null
  const hasServerRowOrder = !!rowsList?.some((r) => typeof r.row_order === 'number')

  const baseRowIds = useMemo(() => rowsList?.map((r) => r.id) ?? [], [rowsList])
  const ORDER_STORAGE_KEY = useMemo(() => rowOrderStorageKey(tableId), [tableId])

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
  }, [ORDER_STORAGE_KEY])

  // Clear pending order once server order matches (after a successful reorder write).
  useEffect(() => {
    if (!pendingOrderIds) return
    const sameLength = pendingOrderIds.length === baseRowIds.length
    const sameOrder = sameLength && pendingOrderIds.every((id, idx) => id === baseRowIds[idx])
    if (sameOrder) setPendingOrderIds(null)
  }, [pendingOrderIds, baseRowIds, setPendingOrderIds])

  const mergedPersistedOrder = useMemo(() => {
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
  }, [hasServerRowOrder, persistedOrder, baseRowIds])

  const displayRowIds = dragOrder ?? pendingOrderIds ?? mergedPersistedOrder ?? baseRowIds
  const rowsById = useMemo(() => new Map((rowsList ?? []).map((r) => [r.id, r] as const)), [rowsList])
  const displayRows = useMemo(
    () => displayRowIds.map((id) => rowsById.get(id)).filter(Boolean) as ExtractedRow[],
    [displayRowIds, rowsById]
  )

  return {
    rowsList,
    hasServerRowOrder,
    baseRowIds,
    ORDER_STORAGE_KEY,
    persistedOrder,
    setPersistedOrder,
    displayRowIds,
    rowsById,
    displayRows,
  }
}

