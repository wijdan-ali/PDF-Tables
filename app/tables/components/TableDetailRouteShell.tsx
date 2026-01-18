'use client'

import useSWR from 'swr'
import { useParams } from 'next/navigation'
import TableDetailClient from '../[tableId]/components/TableDetailClient'
import type { Table } from '@/types/api'
import { useEffect } from 'react'
import TableDetailSkeleton from '../[tableId]/components/TableDetailSkeleton'
import { TABLE_NAME_UPDATED_EVENT } from '@/lib/constants/events'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function TableDetailRouteShell() {
  const params = useParams<{ tableId?: string }>()
  const tableId = typeof params?.tableId === 'string' ? params.tableId : null

  const key = tableId ? `/api/tables/${tableId}` : null
  const { data, mutate } = useSWR<any>(key, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  })

  // If a table is renamed, update this SWR cache immediately so we never show stale names on revisit.
  useEffect(() => {
    if (!tableId) return
    const onNameUpdated = (evt: Event) => {
      const e = evt as CustomEvent<{ tableId: string; table_name: string; updated_at?: string }>
      const { tableId: id, table_name, updated_at } = e.detail || ({} as any)
      if (!id || id !== tableId || typeof table_name !== 'string') return
      void mutate(
        (prev: any) => {
          if (!prev || typeof prev !== 'object') return prev
          return { ...prev, table_name, updated_at: updated_at ?? new Date().toISOString() }
        },
        { revalidate: false }
      )
    }
    window.addEventListener(TABLE_NAME_UPDATED_EVENT, onNameUpdated as EventListener)
    return () => window.removeEventListener(TABLE_NAME_UPDATED_EVENT, onNameUpdated as EventListener)
  }, [mutate, tableId])

  // Only render on /tables/[tableId]
  if (!tableId) return null

  // Only show loading skeleton when we truly don't have data for this table yet.
  // SWR will serve cached data immediately for tables previously visited in this session.
  if (!data) {
    return <TableDetailSkeleton tableId={tableId} />
  }

  if (data.error) {
    // Keep it silent here; the layout/page can show errors if desired.
    return null
  }

  const tableData: Table = {
    id: data.id,
    table_name: data.table_name,
    columns: (data.columns as any[]) || [],
    created_at: data.created_at,
    updated_at: data.updated_at,
  }

  // Key by table id so the title animation plays on table switches, and internal UI state stays isolated per table.
  return <TableDetailClient key={tableData.id} table={tableData} />
}


