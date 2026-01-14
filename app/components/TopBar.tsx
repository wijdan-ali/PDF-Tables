'use client'

import type { ComponentType } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LifeBuoy, LogOut, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUserInitial } from '@/lib/hooks/useUserProfile'

type MenuItem = {
  key: string
  label: string
  icon: ComponentType<{ className?: string }>
}

const MENU_ITEMS: MenuItem[] = [
  { key: 'settings', label: 'Settings', icon: Settings },
  { key: 'support', label: 'Contact support', icon: LifeBuoy },
  { key: 'signout', label: 'Sign out', icon: LogOut },
]

export default function TopBar() {
  const router = useRouter()
  const { initial, isInitialLoading } = useUserInitial()
  const [open, setOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (menuRef.current?.contains(target)) return
      if (btnRef.current?.contains(target)) return
      setOpen(false)
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const ariaLabel = useMemo(() => (initial ? `User menu (${initial})` : 'User menu'), [initial])

  const contactSupport = () => {
    // Basic "send email" behavior: open user's mail client.
    const subject = encodeURIComponent('Clariparse support')
    const body = encodeURIComponent('')
    window.location.href = `mailto:support@clariparse.com?subject=${subject}&body=${body}`
  }

  const signOut = async () => {
    if (isSigningOut) return
    setIsSigningOut(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      setOpen(false)
      router.push('/login')
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to sign out')
      setIsSigningOut(false)
    }
  }

  return (
    <div
      className="fixed top-0 left-0 right-0 z-40 bg-background"
      style={{ height: '4.5rem' }}
    >
      <div className="h-full w-full flex items-top justify-end pr-8 pt-4">
        <div className="relative">
          <button
            ref={btnRef}
            type="button"
            aria-label={ariaLabel}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => {
              if (isInitialLoading) return
              setOpen((v) => !v)
            }}
            className={[
              'inline-flex h-12 w-12 items-center justify-center rounded-full',
              'border border-border bg-accent/60 text-accent-foreground shadow-sm font-semibold',
              'transition-colors hover:bg-accent/80 hover:text-accent-foreground',
              isInitialLoading ? 'cursor-default' : '',
            ].join(' ')}
          >
            <span className="inline-flex h-6 w-6 items-center justify-center">
              {isInitialLoading ? (
                <span className="h-6 w-6 rounded-md bg-foreground/20 animate-pulse" />
              ) : (
                <span className="text-md font-bold">{initial}</span>
              )}
            </span>
          </button>

          {open && (
            <div
              ref={menuRef}
              role="menu"
              className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lg"
            >
              {MENU_ITEMS.map((item) => {
                const Icon = item.icon

                if (item.key === 'settings') {
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpen(false)
                        router.push('/settings')
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-left hover:bg-accent hover:text-accent-foreground"
                    >
                      <Icon className="h-4 w-4 opacity-80" />
                      <span>{item.label}</span>
                    </button>
                  )
                }

                if (item.key === 'support') {
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpen(false)
                        contactSupport()
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-left hover:bg-accent hover:text-accent-foreground"
                    >
                      <Icon className="h-4 w-4 opacity-80" />
                      <span>{item.label}</span>
                    </button>
                  )
                }

                if (item.key === 'signout') {
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="menuitem"
                      disabled={isSigningOut}
                      onClick={() => void signOut()}
                      className={[
                        'flex w-full items-center gap-3 px-3 py-2.5 text-sm text-left hover:bg-accent hover:text-accent-foreground',
                        isSigningOut ? 'opacity-60 cursor-not-allowed' : '',
                      ].join(' ')}
                    >
                      <Icon className="h-4 w-4 opacity-80" />
                      <span>{isSigningOut ? 'Signing out…' : item.label}</span>
                    </button>
                  )
                }

                return (
                  <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-left hover:bg-accent hover:text-accent-foreground"
                  >
                    <Icon className="h-4 w-4 opacity-80" />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

