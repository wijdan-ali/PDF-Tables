'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PricingPlans, type Tier } from './PricingPlans'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { PLAN_GATE_OPEN_EVENT } from '@/lib/constants/events'

type BillingMe = {
  entitlement?: { tier?: string } | null
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to load billing')
  return (await res.json().catch(() => null)) as any
}

export default function PlanGateModal({
  openWhenTierIsFree = true,
}: {
  openWhenTierIsFree?: boolean
}) {
  const router = useRouter()
  const { data, mutate, isLoading } = useSWR<BillingMe>('/api/billing/me', fetcher, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  })

  const tier: Tier | null = useMemo(() => {
    const t = data?.entitlement?.tier
    return t === 'starter' || t === 'pro' || t === 'pro_trial' || t === 'free' ? (t as Tier) : null
  }, [data?.entitlement?.tier])

  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  // IMPORTANT: Don't render the gate until billing is loaded; prevents a brief "free" flash
  // (e.g. right after trial activation).
  const shouldOpen = openWhenTierIsFree && !isLoading && tier === 'free' && !dismissed

  // Disable background scroll while open.
  useEffect(() => {
    if (!shouldOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [shouldOpen])

  // Allow other UI to re-open the gate (e.g., upload attempts).
  useEffect(() => {
    const onOpen = () => {
      setDismissed(false)
      setError(null)
    }
    window.addEventListener(PLAN_GATE_OPEN_EVENT, onOpen as EventListener)
    return () => window.removeEventListener(PLAN_GATE_OPEN_EVENT, onOpen as EventListener)
  }, [])

  const returnTo = useMemo(() => {
    if (typeof window === 'undefined') return '/tables'
    const path = window.location.pathname || '/tables'
    const qs = window.location.search || ''
    const next = `${path}${qs}`
    return next.startsWith('/') ? next : '/tables'
  }, [])

  const signOut = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
    } finally {
      router.push('/login')
      router.refresh()
    }
  }

  if (!shouldOpen) return null

  return (
    <div
      className="fixed inset-0 z-[200] bg-background/80 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="mx-auto w-full max-w-5xl px-6 py-10 min-h-screen flex flex-col">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="text-sm text-muted-foreground">
            Choose a plan to continue.
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => void signOut()}>
              Sign out
            </Button>
            <Button
              variant="ghost"
              onClick={() => setDismissed(true)}
              aria-label="Close plan selection"
              className="px-2"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex-1 flex flex-col justify-center">
          <PricingPlans
            mode="onboarding"
            currentTier={tier ?? 'free'}
            showTrial
            onSelect={async (sel) => {
              if (isWorking) return
              setError(null)
              setIsWorking(true)
              try {
                if (sel.choice === 'trial') {
                  const res = await fetch('/api/billing/start-trial', { method: 'POST' })
                  const payload = (await res.json().catch(() => ({}))) as any
                  if (!res.ok) throw new Error(payload?.error || 'Failed to start trial')
                  await mutate()
                  router.refresh()
                  return
                }

                const qs = new URLSearchParams()
                qs.set('intent', 'checkout')
                qs.set('plan', sel.choice)
                qs.set('interval', sel.interval)
                qs.set('returnTo', returnTo)
                router.push(`/start?${qs.toString()}`)
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed to continue')
                setIsWorking(false)
              }
            }}
          />
        </div>

        {isWorking && (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Redirecting…
          </div>
        )}
      </div>
    </div>
  )
}

