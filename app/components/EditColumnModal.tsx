'use client'

import { useEffect, useRef, useState } from 'react'
import type { Column } from '@/types/api'

interface EditColumnModalProps {
  isOpen: boolean
  column: Column | null
  onClose: () => void
  onSave: (next: { label: string; desc: string }) => void
}

export default function EditColumnModal({ isOpen, column, onClose, onSave }: EditColumnModalProps) {
  const [label, setLabel] = useState('')
  const [desc, setDesc] = useState('')
  const [error, setError] = useState<string | null>(null)
  const labelInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && column) {
      setLabel(column.label || '')
      setDesc(column.desc || '')
      setError(null)
      setTimeout(() => labelInputRef.current?.focus(), 0)
    }
  }, [isOpen, column])

  if (!isOpen || !column) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!label.trim()) {
      setError('Column name is required')
      return
    }

    if (!desc.trim()) {
      setError('Description is required')
      return
    }

    onSave({ label: label.trim(), desc: desc.trim() })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onMouseDown={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md p-6"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Edit Column</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="edit-column-label" className="block text-sm font-medium text-gray-700 mb-1">
              Column Name
            </label>
            <input
              ref={labelInputRef}
              id="edit-column-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="edit-column-desc" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="edit-column-desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


