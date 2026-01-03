'use client'

import { useState } from 'react'
import { generateVariableKey } from '@/lib/utils/slugify'
import type { Column } from '@/types/api'

interface SchemaEditorProps {
  tableId: string
  initialColumns: Column[]
}

export default function SchemaEditor({ tableId, initialColumns }: SchemaEditorProps) {
  const [columns, setColumns] = useState<Column[]>(initialColumns)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addColumn = () => {
    const newOrder = columns.length > 0 ? Math.max(...columns.map(c => c.order)) + 1 : 0
    setColumns([
      ...columns,
      { label: '', key: '', desc: '', order: newOrder }
    ])
    setIsEditing(true)
  }

  const removeColumn = (index: number) => {
    if (window.confirm('Are you sure you want to delete this column? Historical data will remain but won\'t be displayed.')) {
      setColumns(columns.filter((_, i) => i !== index))
      setIsEditing(true)
    }
  }

  const updateColumn = (index: number, field: 'label' | 'desc', value: string) => {
    const updated = [...columns]
    if (field === 'label') {
      updated[index] = {
        ...updated[index],
        label: value,
        key: generateVariableKey(value),
      }
    } else {
      updated[index] = {
        ...updated[index],
        desc: value,
      }
    }
    setColumns(updated)
    setIsEditing(true)
  }

  const moveColumn = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === columns.length - 1) return

    const updated = [...columns]
    const newIndex = direction === 'up' ? index - 1 : index + 1
    const temp = updated[index]
    updated[index] = updated[newIndex]
    updated[newIndex] = temp

    // Update order values
    updated.forEach((col, i) => {
      col.order = i
    })

    setColumns(updated)
    setIsEditing(true)
  }

  const handleSave = async () => {
    if (columns.some(c => !c.label.trim() || !c.desc.trim())) {
      setError('All columns must have a label and description')
      return
    }

    // Check for duplicate keys
    const keys = columns.map(c => c.key).filter(Boolean)
    if (new Set(keys).size !== keys.length) {
      setError('Column labels must be unique')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/tables/${tableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update schema')
      }

      setIsEditing(false)
      // Optionally refresh the page or update parent state
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update schema')
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setColumns(initialColumns)
    setIsEditing(false)
    setError(null)
  }

  return (
    <div>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {columns.map((column, index) => (
          <div key={index} className="p-4 border border-gray-200 rounded-lg">
            <div className="flex gap-2 items-start">
              <div className="flex-1 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Column Label
                  </label>
                  <input
                    type="text"
                    value={column.label}
                    onChange={(e) => updateColumn(index, 'label', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Total Amount"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={column.desc}
                    onChange={(e) => updateColumn(index, 'desc', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., The final amount including tax"
                    rows={2}
                  />
                </div>
                {column.key && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      Variable Key
                    </label>
                    <input
                      type="text"
                      value={column.key}
                      readOnly
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded text-gray-600"
                    />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 ml-4">
                <button
                  type="button"
                  onClick={() => moveColumn(index, 'up')}
                  disabled={index === 0}
                  className="px-2 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveColumn(index, 'down')}
                  disabled={index === columns.length - 1}
                  className="px-2 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeColumn(index)}
                  className="px-2 py-1 text-sm text-red-600 hover:text-red-700 border border-red-200 rounded hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-4 mt-6">
        <button
          type="button"
          onClick={addColumn}
          className="px-4 py-2 text-sm text-blue-600 hover:text-blue-700 border border-blue-200 rounded hover:bg-blue-50"
        >
          + Add Column
        </button>
        {isEditing && (
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}

