'use client'

import type { Column } from '@/types/api'
import ExtractedRowsGrid from './ExtractedRowsGrid'

interface NotionTableProps {
  tableId: string
  columns: Column[]
  onColumnsChange: (columns: Column[]) => void
}

export default function NotionTable({ tableId, columns, onColumnsChange }: NotionTableProps) {
  // Keep this component for backward compatibility: always render the current table UI.
  return <ExtractedRowsGrid tableId={tableId} columns={columns} onColumnsChange={onColumnsChange} />
}

