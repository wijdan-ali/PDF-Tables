'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { PricingPlans, type Tier } from '@/app/components/PricingPlans'
import { Button } from '@/components/ui/button'
import { apiPath } from '@/lib/api'

type BillingMe = {
  entitlement: { tier: string } | null
  subscription:
    | {
        stripe_subscription_id: string | null
        status: string | null
        plan_key: string | null
        interval: string | null
        amount_usd: number | null
      }
    | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function BillingClient() {
  const router = useRouter()
  const { data, error, mutate, isLoading } = useSWR<BillingMe>(apiPath('/api/billing/me'), fetcher, {
    revalidateOnFocus: true,
  })

  const tier: Tier = useMemo(() => {
    const t = data?.entitlement?.tier
    return t === 'starter' || t === 'pro' || t === 'pro_trial' || t === 'free' ? (t as Tier) : 'free'
  }, [data])

  const [status, setStatus] = useState<string | null>(null)
  const [isWorking, setIsWorking] = useState(false)

  const returnTo = useMemo(() => {
    return '/tables'
  }, [])

  if (isLoading) return null

  if (error || (data as any)?.error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        Failed to load billing info.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {status ? (
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {status}
        </div>
      ) : null}

      <PricingPlans
        mode="upgrade"
        currentTier={tier}
        showTrial={false}
        onSelect={async (sel) => {
          if (isWorking) return
          if (sel.choice === 'trial') return

          setStatus(null)
          setIsWorking(true)
          try {
            // Trial users (no Stripe subscription yet) should go through Checkout.
            if (tier === 'pro_trial' || tier === 'free') {
              const checkoutRes = await fetch(apiPath('/api/billing/checkout-session'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan: sel.choice, interval: sel.interval, returnTo }),
              })
              const checkoutPayload = (await checkoutRes.json().catch(() => ({}))) as any
              if (!checkoutRes.ok) {
                throw new Error(checkoutPayload?.error || 'Failed to create checkout session')
              }
              if (checkoutPayload?.url) {
                window.location.href = checkoutPayload.url
                return
              }
              throw new Error('Missing checkout url')
            }

            // Starter -> Pro: in-place upgrade with proration.
            if (tier === 'starter' && sel.choice === 'pro') {
              const res = await fetch(apiPath('/api/billing/change-plan'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan: 'pro', interval: sel.interval }),
              })
              const payload = (await res.json().catch(() => ({}))) as any
              if (!res.ok) throw new Error(payload?.error || 'Failed to upgrade')
              if (payload?.url) {
                window.location.href = payload.url
                return
              }
              setStatus('Plan updated. Syncing…')
              await mutate()
              router.refresh()
              setStatus('Plan updated.')
              return
            }

            // Default: send to Stripe portal (covers renewals/cancel/downgrade).
            const portalRes = await fetch(apiPath('/api/billing/portal-session'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ returnTo: '/settings?focus=billing' }),
            })
            const portalPayload = (await portalRes.json().catch(() => ({}))) as any
            if (!portalRes.ok) throw new Error(portalPayload?.error || 'Failed to open billing portal')
            if (portalPayload?.url) {
              window.location.href = portalPayload.url
              return
            }
            throw new Error('Failed to open billing portal')
          } catch (e) {
            setStatus(e instanceof Error ? e.message : 'Something went wrong')
            setIsWorking(false)
          }
        }}
      />

      <div className="flex items-center justify-center">
        <Button variant="ghost" onClick={() => router.push('/settings?focus=billing')}>
          Back to settings
        </Button>
      </div>
    </div>
  )
}

