'use client'

import { useState, useEffect, useRef } from 'react'
import { generateVariableKey } from '@/lib/utils/slugify'

interface AddColumnModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (label: string, desc: string) => void
  existingKeys: string[]
}

export default function AddColumnModal({ isOpen, onClose, onAdd, existingKeys }: AddColumnModalProps) {
  const [label, setLabel] = useState('')
  const [desc, setDesc] = useState('')
  const [error, setError] = useState<string | null>(null)
  const labelInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && labelInputRef.current) {
      labelInputRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      setLabel('')
      setDesc('')
      setError(null)
    }
  }, [isOpen])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!label.trim()) {
      setError('Column name is required')
      return
    }

    if (!desc.trim()) {
      setError('Description is required for accurate data extraction')
      return
    }

    const key = generateVariableKey(label)
    if (existingKeys.includes(key)) {
      setError('A column with this name already exists')
      return
    }

    onAdd(label.trim(), desc.trim())
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-20" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Add Column</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="column-label" className="block text-sm font-medium text-gray-700 mb-1">
              Column Name
            </label>
            <input
              ref={labelInputRef}
              id="column-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Total Amount"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="column-desc" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="column-desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="e.g., The final amount including tax"
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
              Add Column
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

