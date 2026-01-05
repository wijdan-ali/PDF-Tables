'use client'

import { useState, useRef, useEffect } from 'react'
import { junicode } from '@/app/fonts'

interface EditableTableNameProps {
  tableId: string
  initialName: string
  onUpdate?: (newName: string) => void
}

const TABLE_NAME_UPDATED_EVENT = 'pdf-tables:table-name-updated'
const TABLE_TOUCHED_EVENT = 'pdf-tables:table-touched'

export default function EditableTableName({ tableId, initialName, onUpdate }: EditableTableNameProps) {
  const [name, setName] = useState(initialName)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setName(initialName)
  }, [initialName])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
      // Auto-size to content to avoid any layout jump between display/edit
      const el = inputRef.current
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [isEditing])

  const handleBlur = async () => {
    if (name.trim() === '') {
      setName(initialName)
      setIsEditing(false)
      return
    }

    if (name.trim() === initialName) {
      setIsEditing(false)
      return
    }

    setIsSaving(true)
    try {
      const nextName = name.trim()
      const response = await fetch(`/api/tables/${tableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_name: nextName }),
      })

      if (!response.ok) {
        throw new Error('Failed to update table name')
      }

      if (onUpdate) {
        onUpdate(nextName)
      }
      // Let other UI (Sidebar) update instantly without a full refresh.
      window.dispatchEvent(
        new CustomEvent(TABLE_NAME_UPDATED_EVENT, {
          detail: { tableId, table_name: nextName, updated_at: new Date().toISOString() },
        })
      )
      window.dispatchEvent(
        new CustomEvent(TABLE_TOUCHED_EVENT, {
          detail: { tableId, updated_at: new Date().toISOString() },
        })
      )
      setIsEditing(false)
    } catch (err) {
      console.error('Failed to update table name:', err)
      setName(initialName)
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      setName(initialName)
      setIsEditing(false)
    }
  }

  // One wrapper with stable padding/line-height so edit/display never "jump"
  return (
    <div
      className="w-full max-w-full rounded px-1 py-0.5 -mx-1"
      style={{ minHeight: '1.5em' }}
    >
      {/* Render both in the same grid cell to keep identical geometry between modes */}
      <div className="grid">
        <h1
          onClick={() => setIsEditing(true)}
          className={`${junicode.className} col-start-1 row-start-1 text-[34px] font-bold text-gray-900 cursor-text hover:bg-gray-50 transition-colors leading-[1.25] whitespace-pre-wrap break-words ${
            isEditing ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
          style={{ margin: 0 }}
        >
          {name || 'Untitled'}
        </h1>
        <textarea
          ref={inputRef}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            // Auto-resize textarea as user types/wraps
            const el = e.currentTarget
            el.style.height = 'auto'
            el.style.height = `${el.scrollHeight}px`
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          rows={1}
          className={`${junicode.className} col-start-1 row-start-1 w-full min-w-0 text-[34px] font-bold bg-transparent border-none outline-none focus:outline-none p-0 m-0 leading-[1.25] resize-none overflow-hidden ${
            isEditing ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          style={{ color: 'rgb(55, 53, 47)' }}
        />
      </div>
    </div>
  )
}

