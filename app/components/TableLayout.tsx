'use client'

import { useEffect, useRef, useState } from 'react'
import Sidebar from './Sidebar'
import { PanelLeftOpen } from 'lucide-react'
import TopBar from './TopBar'
import { createClient } from '@/lib/supabase/client'

export default function TableLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const didInitRef = useRef(false)
  const userIdRef = useRef<string | null>(null)

  // Load preferences from DB (fallback to localStorage).
  useEffect(() => {
    let cancelled = false

    const fallbackLocal = () => {
      try {
        const raw = localStorage.getItem('pdf-tables:sidebar-collapsed')
        if (raw === '1') setCollapsed(true)
      } catch {
        // ignore
      }
    }

    const run = async () => {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          fallbackLocal()
          return
        }

        userIdRef.current = user.id

        const { data: settings } = await supabase
          .from('user_settings')
          .select('sidebar_collapsed')
          .eq('user_id', user.id)
          .maybeSingle()

        if (cancelled) return

        if (typeof settings?.sidebar_collapsed === 'boolean') {
          setCollapsed(settings.sidebar_collapsed)
        } else {
          fallbackLocal()
        }
      } catch {
        if (!cancelled) fallbackLocal()
      } finally {
        if (!cancelled) didInitRef.current = true
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!didInitRef.current) return

    try {
      localStorage.setItem('pdf-tables:sidebar-collapsed', collapsed ? '1' : '0')
    } catch {
      // ignore
    }

    const userId = userIdRef.current
    if (!userId) return

    const supabase = createClient()
    void supabase.from('user_settings').upsert(
      {
        user_id: userId,
        sidebar_collapsed: collapsed,
      },
      { onConflict: 'user_id' }
    )
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
        style={
          {
            // Used by TopBar + content wrapper below.
            // - topbar-h: fixed top bar height
            // - content-top-pad: consistent top padding for every view/page
            ['--topbar-h' as any]: '56px',
            ['--content-top-pad' as any]: '32px',
          } as React.CSSProperties
        }
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
        <TopBar />
        <div className="pt-[calc(var(--topbar-h)+var(--content-top-pad))]">
          {children}
        </div>
      </main>
    </div>
  )
}

