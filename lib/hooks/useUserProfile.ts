'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PROFILE_UPDATED_EVENT } from '@/lib/constants/events'
import { USER_INITIAL_CACHE_KEY } from '@/lib/constants/storage'

export function computeInitialFromNameOrEmail(input: { fullName?: string; email?: string }): string {
  const fullName = (input.fullName ?? '').trim()
  const email = (input.email ?? '').trim()
  const source = fullName || email
  return source ? source[0]!.toUpperCase() : '?'
}

function readCachedInitial(): string | null {
  try {
    const raw = sessionStorage.getItem(USER_INITIAL_CACHE_KEY)
    return raw ? raw : null
  } catch {
    return null
  }
}

export function writeCachedInitial(v: string) {
  try {
    sessionStorage.setItem(USER_INITIAL_CACHE_KEY, v)
  } catch {
    // ignore
  }
}

export function useUserInitial() {
  // Important: avoid hydration mismatches by not reading sessionStorage during render.
  const [initial, setInitial] = useState<string | null>(null)
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true)

  useEffect(() => {
    // Fast path: use cached initial (after mount).
    const cached = readCachedInitial()
    if (cached) {
      setInitial(cached)
      setIsInitialLoading(false)
    }

    const supabase = createClient()
    void supabase.auth.getUser().then(({ data }) => {
      const user = data.user
      if (!user) {
        setInitial(null)
        setIsInitialLoading(false)
        return
      }

      const email = user.email ?? ''
      const fallbackFullName =
        (user.user_metadata && typeof (user.user_metadata as any).full_name === 'string'
          ? ((user.user_metadata as any).full_name as string)
          : '') || ''

      void supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data: profile }) => {
          const fullName = (profile?.full_name ?? fallbackFullName).trim()
          const next = computeInitialFromNameOrEmail({ fullName, email })
          setInitial(next)
          writeCachedInitial(next)
          setIsInitialLoading(false)
        })
    })
  }, [])

  // If profile name changes elsewhere (e.g. Settings), update immediately.
  useEffect(() => {
    const onProfileUpdated = (evt: Event) => {
      const e = evt as CustomEvent<{ initial?: string }>
      const next = (e.detail?.initial ?? '').trim()
      if (!next) return
      setInitial(next)
      writeCachedInitial(next)
      setIsInitialLoading(false)
    }
    window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated as EventListener)
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated as EventListener)
  }, [])

  return { initial, isInitialLoading }
}

