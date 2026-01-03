'use client'

import { useState } from 'react'
import useSWR from 'swr'
import PdfThumbnailCell from './PdfThumbnailCell'
import type { Column, ExtractedRow } from '@/types/api'

interface ExtractedRowsGridProps {
  tableId: string
  columns: Column[]
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function ExtractedRowsGrid({ tableId, columns }: ExtractedRowsGridProps) {
  const { data: rows, error, mutate } = useSWR<ExtractedRow[]>(
    `/api/tables/${tableId}/rows`,
    fetcher,
    { refreshInterval: 5000 } // Poll every 5 seconds for extraction status updates
  )

  const [editingRow, setEditingRow] = useState<string | null>(null)
  const [editingData, setEditingData] = useState<Record<string, string | number | null>>({})
  const [isSaving, setIsSaving] = useState(false)

  const sortedColumns = [...columns].sort((a, b) => a.order - b.order)

  const startEditing = (row: ExtractedRow) => {
    if (row.status !== 'extracted' && row.status !== 'failed') return
    setEditingRow(row.id)
    setEditingData({ ...row.data })
  }

  const cancelEditing = () => {
    setEditingRow(null)
    setEditingData({})
  }

  const saveRow = async (rowId: string) => {
    setIsSaving(true)
    try {
      const response = await fetch(`/api/rows/${rowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: editingData }),
      })

      if (!response.ok) {
        throw new Error('Failed to save row')
      }

      await mutate()
      setEditingRow(null)
      setEditingData({})
    } catch (err) {
      alert('Failed to save changes. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const verifyRow = async (rowId: string) => {
    try {
      const response = await fetch(`/api/rows/${rowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_verified: true }),
      })

      if (!response.ok) {
        throw new Error('Failed to verify row')
      }

      await mutate()
    } catch (err) {
      alert('Failed to verify row. Please try again.')
    }
  }

  const retryExtraction = async (rowId: string) => {
    try {
      const response = await fetch(`/api/tables/${tableId}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row_id: rowId }),
      })

      if (!response.ok) {
        throw new Error('Failed to retry extraction')
      }

      await mutate()
    } catch (err) {
      alert('Failed to retry extraction. Please try again.')
    }
  }

  const getStatusBadge = (status: ExtractedRow['status']) => {
    const badges = {
      uploaded: { label: 'Uploaded', className: 'bg-gray-100 text-gray-700' },
      extracting: { label: 'Extracting...', className: 'bg-blue-100 text-blue-700' },
      extracted: { label: 'Extracted', className: 'bg-green-100 text-green-700' },
      failed: { label: 'Failed', className: 'bg-red-100 text-red-700' },
    }
    const badge = badges[status]
    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded ${badge.className}`}>
        {badge.label}
        {status === 'extracting' && (
          <span className="ml-1 inline-block w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
        )}
      </span>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
        Error loading rows: {error.message || 'Unknown error'}
      </div>
    )
  }

  if (!rows) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-100 animate-pulse rounded"></div>
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-gray-600">
        <p>No rows yet. Upload a PDF to create your first row.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {sortedColumns.map((column) => (
              <th
                key={column.key}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                {column.label}
              </th>
            ))}
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              PDF
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {rows.map((row) => {
            const isEditing = editingRow === row.id
            const isVerified = row.is_verified
            const canEdit = row.status === 'extracted' || row.status === 'failed'
            const rowBgColor = isVerified
              ? 'bg-green-50'
              : row.status === 'extracted' || row.status === 'failed'
              ? 'bg-yellow-50'
              : 'bg-white'

            return (
              <tr key={row.id} className={rowBgColor}>
                {sortedColumns.map((column) => {
                  const value = row.data[column.key] ?? null
                  const displayValue = value === null || value === '' ? '—' : String(value)

                  return (
                    <td key={column.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editingData[column.key] ?? ''}
                          onChange={(e) =>
                            setEditingData({
                              ...editingData,
                              [column.key]: e.target.value || null,
                            })
                          }
                          className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="—"
                        />
                      ) : (
                        <span>{displayValue}</span>
                      )}
                    </td>
                  )
                })}
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {getStatusBadge(row.status)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <div className="flex gap-2">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => saveRow(row.id)}
                          disabled={isSaving}
                          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                          {isSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        {canEdit && (
                          <button
                            onClick={() => startEditing(row)}
                            className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                          >
                            Edit
                          </button>
                        )}
                        {row.status === 'extracted' && !isVerified && (
                          <button
                            onClick={() => verifyRow(row.id)}
                            className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                          >
                            Verify
                          </button>
                        )}
                        {row.status === 'failed' && (
                          <button
                            onClick={() => retryExtraction(row.id)}
                            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            Retry
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <PdfThumbnailCell
                    thumbnailUrl={row.thumbnail_url}
                    pdfUrl={row.pdf_url}
                    filename={`row-${row.id}.pdf`}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

