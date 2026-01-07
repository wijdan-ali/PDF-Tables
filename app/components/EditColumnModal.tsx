'use client'

import { useEffect, useRef, useState } from 'react'
import type { Column } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div className="w-full max-w-md px-4" onMouseDown={(e) => e.stopPropagation()}>
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle>Edit Column</CardTitle>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-column-label">Column Name</Label>
                <Input
                  ref={labelInputRef}
                  id="edit-column-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-column-desc">Description</Label>
                <Textarea
                  id="edit-column-desc"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={3}
                />
              </div>

              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </CardContent>

            <CardFooter className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}


