'use client'

import useSWR from 'swr'
import type { ExtractedRow } from '@/types/api'

const fetcher = async (url: string): Promise<ExtractedRow[]> => {
  const res = await fetch(url)
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = typeof (data as any)?.error === 'string' ? (data as any).error : `Request failed (${res.status})`
    throw new Error(msg)
  }
  if (!Array.isArray(data)) {
    throw new Error('Unexpected response shape')
  }
  return data as ExtractedRow[]
}

export function useRows({
  tableId,
  isPaused,
}: {
  tableId: string
  isPaused: () => boolean
}) {
  return useSWR<ExtractedRow[]>(`/api/tables/${tableId}/rows`, fetcher, {
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
    isPaused,
  })
}

