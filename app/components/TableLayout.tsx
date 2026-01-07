'use client'

import { useEffect, useState } from 'react'
import Sidebar from './Sidebar'
import { PanelLeftOpen } from 'lucide-react'

export default function TableLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)

  // Persist per-session (no server involvement).
  useEffect(() => {
    try {
      const raw = localStorage.getItem('pdf-tables:sidebar-collapsed')
      if (raw === '1') setCollapsed(true)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('pdf-tables:sidebar-collapsed', collapsed ? '1' : '0')
    } catch {
      // ignore
    }
  }, [collapsed])

  return (
    // Prevent page-level horizontal scrolling; tables manage their own horizontal scroll
    <div className="flex min-h-screen bg-background overflow-x-hidden">
      <Sidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((v) => !v)} />
      {/* Allow normal page scrolling (no fixed-height inner scroller) */}
      <main
        className={[
          'flex-1 min-w-0 overflow-x-hidden transition-[margin-left] duration-300 ease-out',
          collapsed ? 'ml-0' : 'ml-80',
        ].join(' ')}
      >
        {/* When collapsed, show a small "open" control in the top-left */}
        {collapsed && (
          <button
            type="button"
            aria-label="Show sidebar"
            onClick={() => setCollapsed(false)}
            className="fixed left-4 top-4 z-50 inline-flex items-center justify-center rounded-xl border border-border bg-card px-2.5 py-2 text-foreground shadow-sm backdrop-blur-md transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
        {children}
      </main>
    </div>
  )
}

