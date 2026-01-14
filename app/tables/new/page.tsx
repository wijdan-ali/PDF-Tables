'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TABLE_CREATED_EVENT } from '@/lib/constants/events'

export default function CreateTablePage() {
  const router = useRouter()
  const [tableName, setTableName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!tableName.trim()) {
      setError('Table name is required')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_name: tableName.trim(),
          columns: [],
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create table')
      }

      const data = await response.json()
      // Tell the Sidebar (client component living in the /tables layout) to immediately
      // add this table without requiring a full page reload.
      window.dispatchEvent(
        new CustomEvent(TABLE_CREATED_EVENT, {
          detail: { table: { ...data.table, records_count: 0 } },
        })
      )
      router.push(`/tables/${data.table.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create table')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="pl-[100px] pr-8 pb-8 max-w-2xl">
      <h1 className="text-3xl font-semibold text-foreground mb-8">Create New Table</h1>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive mb-4">
          {error}
        </div>
      )}

      <Card className="shadow-sm">
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Table details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1.5">
              <Label htmlFor="tableName">Table Name</Label>
              <Input
                id="tableName"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="e.g., Monthly Invoices"
                required
              />
            </div>
            <p className="text-sm text-muted-foreground">You can add columns after creating the table.</p>
          </CardContent>
          <CardFooter className="flex gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Table'}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

