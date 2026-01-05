'use client'

import { useState, useEffect } from 'react'
import EditableTableName from '@/app/components/EditableTableName'
import UploadPanel from './UploadPanel'
import RecordsCard from './RecordsCard'
import ExtractedRowsGrid from './ExtractedRowsGrid'
import type { Table, Column } from '@/types/api'

interface TableDetailClientProps {
  table: Table
}

export default function TableDetailClient({ table: initialTable }: TableDetailClientProps) {
  const [table, setTable] = useState<Table>(initialTable)
  const [tableName, setTableName] = useState(initialTable.table_name)

  useEffect(() => {
    setTable(initialTable)
    setTableName(initialTable.table_name)
  }, [initialTable])

  const handleTableNameUpdate = (newName: string) => {
    setTableName(newName)
    setTable({ ...table, table_name: newName })
  }

  const handleColumnsChange = (columns: Column[]) => {
    setTable({ ...table, columns })
  }

  return (
    <div className="pt-8 pb-8 max-w-full">
      {/* Keep existing padding for header + upload */}
      <div className="pl-[100px] pr-8">
      {/* Table Name - Editable */}
      <div className="mb-8">
        <EditableTableName
          tableId={table.id}
          initialName={tableName}
          onUpdate={handleTableNameUpdate}
        />
      </div>

      {/* Upload File Card */}
      <div className="mb-[30px]">
        <div className="flex flex-wrap gap-5 items-stretch">
          <RecordsCard tableId={table.id} />
        <UploadPanel tableId={table.id} columnsCount={table.columns.length} />
        </div>
        </div>
      </div>

      {/* Table View - 0 horizontal padding (full-bleed inside main) */}
      <div className="mb-8">
        <ExtractedRowsGrid 
          tableId={table.id} 
          columns={table.columns}
          onColumnsChange={handleColumnsChange}
        />
      </div>
    </div>
  )
}

