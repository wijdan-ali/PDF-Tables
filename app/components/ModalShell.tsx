'use client'

import { useEffect } from 'react'

export default function ModalShell({
  open,
  onClose,
  children,
  contentClassName = 'w-full max-w-md px-4',
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  contentClassName?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className={contentClassName} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

