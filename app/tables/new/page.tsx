'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { generateVariableKey } from '@/lib/utils/slugify'
import type { Column } from '@/types/api'

export default function CreateTablePage() {
  const router = useRouter()
  const [tableName, setTableName] = useState('')
  const [columns, setColumns] = useState<Array<{ label: string; desc: string; key: string }>>([
    { label: '', desc: '', key: '' }
  ])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addColumn = () => {
    setColumns([...columns, { label: '', desc: '', key: '' }])
  }

  const removeColumn = (index: number) => {
    setColumns(columns.filter((_, i) => i !== index))
  }

  const updateColumn = (index: number, field: 'label' | 'desc', value: string) => {
    const updated = [...columns]
    updated[index] = {
      ...updated[index],
      [field]: value,
      key: field === 'label' ? generateVariableKey(value) : updated[index].key,
    }
    setColumns(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!tableName.trim()) {
      setError('Table name is required')
      return
    }

    if (columns.length === 0 || columns.some(c => !c.label.trim() || !c.desc.trim())) {
      setError('All columns must have a label and description')
      return
    }

    // Check for duplicate keys
    const keys = columns.map(c => c.key).filter(Boolean)
    if (new Set(keys).size !== keys.length) {
      setError('Column labels must be unique')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_name: tableName,
          columns: columns.map(({ label, desc }) => ({ label, desc })),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create table')
      }

      const table = await response.json()
      router.push(`/tables/${table.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create table')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8">Create New Table</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="tableName" className="block text-sm font-medium text-gray-700 mb-2">
            Table Name
          </label>
          <input
            id="tableName"
            type="text"
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., Monthly Invoices"
            required
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-4">
            <label className="block text-sm font-medium text-gray-700">
              Columns
            </label>
            <button
              type="button"
              onClick={addColumn}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              + Add Column
            </button>
          </div>

          <div className="space-y-4">
            {columns.map((column, index) => (
              <div key={index} className="p-4 border border-gray-200 rounded-lg space-y-3">
                <div className="flex justify-between items-start">
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
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description (for AI extraction)
                      </label>
                      <textarea
                        value={column.desc}
                        onChange={(e) => updateColumn(index, 'desc', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="e.g., The final amount including tax"
                        rows={2}
                        required
                      />
                    </div>
                    {column.key && (
                      <div>
                        <label className="block text-sm font-medium text-gray-500 mb-1">
                          Variable Key (auto-generated)
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
                  {columns.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeColumn(index)}
                      className="ml-4 text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Creating...' : 'Create Table'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

