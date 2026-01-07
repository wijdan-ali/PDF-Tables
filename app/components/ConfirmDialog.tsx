'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
  isLoading?: boolean
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm"
      onMouseDown={onCancel}
    >
      <div onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-md px-4">
        <Card className="shadow-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{title}</CardTitle>
          </CardHeader>
          {(description || '').length > 0 && (
            <CardContent className="pt-0 text-sm text-muted-foreground">{description}</CardContent>
          )}
          <CardFooter className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={isLoading}>
              {cancelText}
            </Button>
            <Button
              type="button"
              variant={destructive ? 'destructive' : 'default'}
              onClick={onConfirm}
              disabled={isLoading}
            >
              {isLoading ? 'Working…' : confirmText}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}


