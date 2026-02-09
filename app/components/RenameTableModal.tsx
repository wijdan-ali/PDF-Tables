'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSWRConfig } from 'swr'
import ModalShell from '@/app/components/ModalShell'
import { apiPath } from '@/lib/api'

interface RenameTableModalProps {
  isOpen: boolean
  tableId: string | null
  initialName: string
  onClose: () => void
  onRenamed?: (next: { tableId: string; table_name: string; updated_at?: string }) => void
}

export default function RenameTableModal({
  isOpen,
  tableId,
  initialName,
  onClose,
  onRenamed,
}: RenameTableModalProps) {
  const { mutate } = useSWRConfig()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    setName(initialName || '')
    setError(null)
    setIsSaving(false)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [isOpen, initialName])

  if (!isOpen || !tableId) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSaving) return
    setError(null)

    const nextName = name.trim()
    if (!nextName) {
      setError('Table name is required')
      return
    }
    if (nextName === initialName.trim()) {
      onClose()
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch(apiPath(`/api/tables/${tableId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_name: nextName }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) throw new Error(data?.error || 'Failed to rename table')

      const updated_at = typeof data?.updated_at === 'string' ? data.updated_at : new Date().toISOString()

      // Update SWR caches so navigating to the table doesn't show stale name first.
      void mutate(
        apiPath(`/api/tables/${tableId}`),
        (prev: any) => {
          if (!prev || typeof prev !== 'object') return prev
          return { ...prev, table_name: nextName, updated_at }
        },
        { revalidate: false, populateCache: true }
      )
      void mutate(
        apiPath('/api/tables'),
        (prev: any) => {
          if (!Array.isArray(prev)) return prev
          const next = prev.map((t: any) =>
            t?.id === tableId ? { ...t, table_name: nextName, updated_at } : t
          )
          // Keep updated_at desc ordering if present
          next.sort((a: any, b: any) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0))
          return next
        },
        { revalidate: false, populateCache: true }
      )

      onRenamed?.({
        tableId,
        table_name: nextName,
        updated_at,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename table')
      setIsSaving(false)
    }
  }

  return (
    <ModalShell open={isOpen} onClose={onClose} contentClassName="w-full max-w-md px-4">
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle>Rename table</CardTitle>
        </CardHeader>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rename-table-name">Table name</Label>
              <Input
                ref={inputRef}
                id="rename-table-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSaving}
              />
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </ModalShell>
  )
}

