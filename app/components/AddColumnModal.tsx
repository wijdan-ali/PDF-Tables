'use client'

import { useState, useEffect, useRef } from 'react'
import { generateVariableKey } from '@/lib/utils/slugify'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import ModalShell from '@/app/components/ModalShell'

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
    <ModalShell open={isOpen} onClose={onClose} contentClassName="w-full max-w-md px-4">
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle>Add Column</CardTitle>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="column-label">Column Name</Label>
              <Input
                ref={labelInputRef}
                id="column-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g., Total Amount"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="column-desc">Description</Label>
              <Textarea
                id="column-desc"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="e.g., The final amount including tax"
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
            <Button type="submit">Add Column</Button>
          </CardFooter>
        </form>
      </Card>
    </ModalShell>
  )
}

