'use client'

import { Plus } from 'lucide-react'

export default function AddColumnButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl border border-primary/35 bg-primary px-2.5 py-1.5 text-[13px] font-medium text-primary-foreground shadow-sm backdrop-blur-md transition-[transform,box-shadow,filter] duration-200 ease-out hover:-translate-y-[1px] hover:shadow-md hover:brightness-[1.03] active:translate-y-0 active:brightness-[0.99]"
    >
      {/* subtle glass highlight */}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary-foreground/18 to-transparent opacity-60 transition-opacity duration-200 group-hover:opacity-80" />
      <span className="relative inline-flex h-5 w-5 items-center justify-center rounded-full border border-primary-foreground/45 bg-primary-foreground/14 text-primary-foreground transition-[border-color,background-color,transform] duration-200 ease-out group-hover:border-primary-foreground/60 group-hover:bg-primary-foreground/18">
        <Plus className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="relative">Add Column</span>
    </button>
  )
}

