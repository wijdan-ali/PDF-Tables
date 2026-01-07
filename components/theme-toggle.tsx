'use client'

import * as React from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()

  const resolved = theme === 'dark' ? 'dark' : 'light'

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
      className={cn(
        "inline-flex items-center justify-center rounded-xl border border-border bg-card px-2.5 py-2 text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground",
        className
      )}
    >
      <Sun className="h-4 w-4 dark:hidden" />
      <Moon className="hidden h-4 w-4 dark:block" />
    </button>
  )
}

