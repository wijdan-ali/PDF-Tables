'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AI_PROVIDER_STORAGE_KEY, SIDEBAR_COLLAPSED_KEY } from '@/lib/constants/storage'

export type AiProvider = 'chatpdf' | 'gemini' | 'openrouter'

function normalizeAiProvider(raw: unknown): AiProvider {
  return raw === 'gemini' || raw === 'openrouter' ? raw : 'chatpdf'
}

function readAiProviderLocal(): AiProvider {
  try {
    const raw = localStorage.getItem(AI_PROVIDER_STORAGE_KEY)
    return normalizeAiProvider(raw)
  } catch {
    return 'chatpdf'
  }
}

function writeAiProviderLocal(v: AiProvider) {
  try {
    localStorage.setItem(AI_PROVIDER_STORAGE_KEY, v)
  } catch {
    // ignore
  }
}

export function useAiProvider() {
  const [aiProvider, setAiProvider] = useState<AiProvider>(() =>
    typeof window === 'undefined' ? 'chatpdf' : readAiProviderLocal()
  )
  const [userId, setUserId] = useState<string | null>(null)
  const didInitRef = useRef(false)

  // Hydrate from DB if present; fallback remains localStorage for resiliency.
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return
      if (cancelled) return
      setUserId(user.id)

      try {
        const { data: settings } = await supabase
          .from('user_settings')
          .select('ai_provider')
          .eq('user_id', user.id)
          .maybeSingle()

        if (cancelled) return
        const pref = settings?.ai_provider
        const normalized = normalizeAiProvider(pref)
        setAiProvider(normalized)
        writeAiProviderLocal(normalized)
      } finally {
        if (!cancelled) didInitRef.current = true
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  // Persist to localStorage immediately; to DB after initialization.
  useEffect(() => {
    writeAiProviderLocal(aiProvider)
    if (!didInitRef.current) return
    if (!userId) return

    const supabase = createClient()
    void supabase.from('user_settings').upsert({ user_id: userId, ai_provider: aiProvider }, { onConflict: 'user_id' })
  }, [aiProvider, userId])

  return { aiProvider, setAiProvider, userId }
}

function readCollapsedLocal(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function writeCollapsedLocal(v: boolean) {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, v ? '1' : '0')
  } catch {
    // ignore
  }
}

export function useSidebarCollapsedPreference() {
  const [collapsed, setCollapsed] = useState<boolean>(() =>
    typeof window === 'undefined' ? false : readCollapsedLocal()
  )

  const didInitRef = useRef(false)
  const userIdRef = useRef<string | null>(null)

  // Load preference from DB (fallback to localStorage).
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) return
        userIdRef.current = user.id

        const { data: settings } = await supabase
          .from('user_settings')
          .select('sidebar_collapsed')
          .eq('user_id', user.id)
          .maybeSingle()

        if (cancelled) return
        if (typeof settings?.sidebar_collapsed === 'boolean') {
          setCollapsed(settings.sidebar_collapsed)
        }
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
    writeCollapsedLocal(collapsed)

    const userId = userIdRef.current
    if (!userId) return
    const supabase = createClient()
    void supabase
      .from('user_settings')
      .upsert({ user_id: userId, sidebar_collapsed: collapsed }, { onConflict: 'user_id' })
  }, [collapsed])

  return { collapsed, setCollapsed }
}

