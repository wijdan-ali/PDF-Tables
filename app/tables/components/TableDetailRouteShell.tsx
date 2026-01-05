'use client'

import useSWR from 'swr'
import { useParams } from 'next/navigation'
import TableDetailClient from '../[tableId]/components/TableDetailClient'
import type { Table } from '@/types/api'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function TableDetailRouteShell() {
  const params = useParams<{ tableId?: string }>()
  const tableId = typeof params?.tableId === 'string' ? params.tableId : null

  // Only render on /tables/[tableId]
  if (!tableId) return null

  const { data } = useSWR<any>(`/api/tables/${tableId}`, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    keepPreviousData: true,
  })

  if (!data || data.error) {
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

  return <TableDetailClient table={tableData} />
}


