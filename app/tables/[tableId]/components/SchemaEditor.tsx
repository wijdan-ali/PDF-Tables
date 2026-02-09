'use client'

import { useState } from 'react'
import { generateVariableKey } from '@/lib/utils/slugify'
import type { Column } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { apiPath } from '@/lib/api'

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
      const response = await fetch(apiPath(`/api/tables/${tableId}`), {
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
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive mb-4">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {columns.map((column, index) => (
          <Card key={index}>
            <div className="flex gap-2 items-start">
              <CardContent className="flex-1 space-y-3 pt-6">
                <div>
                  <Label className="mb-1 block text-sm font-medium" htmlFor={`schema-label-${index}`}>
                    Column Label
                  </Label>
                  <Input
                    id={`schema-label-${index}`}
                    type="text"
                    value={column.label}
                    onChange={(e) => updateColumn(index, 'label', e.target.value)}
                    placeholder="e.g., Total Amount"
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-sm font-medium" htmlFor={`schema-desc-${index}`}>
                    Description
                  </Label>
                  <Textarea
                    id={`schema-desc-${index}`}
                    value={column.desc}
                    onChange={(e) => updateColumn(index, 'desc', e.target.value)}
                    placeholder="e.g., The final amount including tax"
                    rows={2}
                  />
                </div>
                {column.key && (
                  <div>
                    <Label className="mb-1 block text-sm font-medium text-muted-foreground" htmlFor={`schema-key-${index}`}>
                      Variable Key
                    </Label>
                    <Input
                      id={`schema-key-${index}`}
                      type="text"
                      value={column.key}
                      readOnly
                      className="bg-muted text-muted-foreground"
                    />
                  </div>
                )}
              </CardContent>
              <div className="flex flex-col gap-2 ml-4">
                <Button
                  type="button"
                  onClick={() => moveColumn(index, 'up')}
                  disabled={index === 0}
                  variant="outline"
                  size="sm"
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  onClick={() => moveColumn(index, 'down')}
                  disabled={index === columns.length - 1}
                  variant="outline"
                  size="sm"
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  onClick={() => removeColumn(index)}
                  variant="destructive"
                  size="sm"
                >
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex gap-4 mt-6">
        <Button
          type="button"
          onClick={addColumn}
          variant="outline"
        >
          + Add Column
        </Button>
        {isEditing && (
          <>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button
              type="button"
              onClick={handleCancel}
              variant="outline"
            >
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

