'use client'

import { useMemo, useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export type BillingInterval = 'month' | 'year'
export type PlanChoice = 'trial' | 'starter' | 'pro'
export type Tier = 'free' | 'starter' | 'pro' | 'pro_trial'

type PlanSelect =
  | { choice: 'trial' }
  | { choice: 'starter'; interval: BillingInterval }
  | { choice: 'pro'; interval: BillingInterval }

type Feature = { label: string; included: boolean; highlight?: boolean }

const PRICING: {
  starter: {
    title: string
    desc: string
    monthly: { now: number; old: number; note: string }
    yearly: { perMonth: number; billed: number; old: number; note: string }
    features: Feature[]
  }
  pro: {
    title: string
    desc: string
    monthly: { now: number; old: number; note: string }
    yearly: { perMonth: number; billed: number; old: number; note: string }
    features: Feature[]
  }
  trial: { title: string; badge: string; desc: string; bullets: string[] }
} = {
  starter: {
    title: 'Starter',
    desc: 'Perfect for individuals and small projects',
    monthly: { now: 19, old: 29, note: 'Save $10/month' },
    yearly: { perMonth: 15, billed: 180, old: 24, note: 'Billed $180/year · Save $48/year' },
    features: [
      { label: '200 documents/month', included: true },
      { label: 'Custom column definitions', included: true },
      { label: 'Batch processing - upload multiple documents at once', included: false },
      { label: 'Priority support', included: false },
    ],
  },
  pro: {
    title: 'Professional',
    desc: 'For teams that need power and flexibility',
    monthly: { now: 49, old: 79, note: 'Save $30/month' },
    yearly: { perMonth: 39, billed: 468, old: 64, note: 'Billed $468/year · Save $120/year' },
    features: [
      { label: 'Unlimited documents', included: true, highlight: true },
      { label: 'Custom column definitions', included: true },
      { label: 'Batch processing - upload multiple documents at once', included: true },
      { label: 'Priority support', included: true },
    ],
  },
  trial: {
    title: 'Free Trial',
    badge: 'No Credit Card',
    desc: 'Try Clariparse risk-free. No credit card required.',
    bullets: ['50 documents included', 'All Professional features', 'No credit card required'],
  },
}

function BillingToggle({
  value,
  onChange,
}: {
  value: BillingInterval
  onChange: (v: BillingInterval) => void
}) {
  return (
    <div className="flex items-center justify-center gap-3">
      <span className={value === 'month' ? 'text-foreground font-medium text-sm' : 'text-muted-foreground text-sm'}>
        Monthly
      </span>
      <button
        type="button"
        aria-label="Toggle billing period"
        className="relative h-7 w-12 rounded-full bg-muted border border-border shadow-inner"
        onClick={() => onChange(value === 'month' ? 'year' : 'month')}
      >
        <span
          className={[
            'absolute top-1 left-1 h-5 w-5 rounded-full bg-background shadow',
            'transition-transform duration-200 ease-out',
            value === 'year' ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
      <span className={value === 'year' ? 'text-foreground font-medium text-sm' : 'text-muted-foreground text-sm'}>
        Yearly
      </span>
      <span className="ml-1 inline-flex items-center rounded-full border border-border bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
        Save 20%
      </span>
    </div>
  )
}

function FeatureItem({
  included,
  label,
  highlight,
  dark,
}: {
  included: boolean
  label: string
  highlight?: boolean
  dark?: boolean
}) {
  const Icon = included ? Check : X
  return (
    <li className={['flex items-start gap-3', highlight ? (dark ? 'text-white' : 'text-foreground') : dark ? 'text-white/90' : 'text-foreground/80'].join(' ')}>
      <span className={['mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border', included ? (dark ? 'border-white/25 bg-white/15' : 'border-border bg-primary/10') : 'border-border bg-muted/40'].join(' ')}>
        <Icon className={['h-3.5 w-3.5', included ? (dark ? 'text-white' : 'text-primary') : 'text-muted-foreground'].join(' ')} />
      </span>
      <span className="text-[14px] leading-snug">{label}</span>
    </li>
  )
}

export function PricingPlans({
  mode,
  currentTier,
  showTrial = true,
  onSelect,
}: {
  mode: 'onboarding' | 'upgrade'
  currentTier: Tier
  showTrial?: boolean
  onSelect: (s: PlanSelect) => void
}) {
  const [interval, setInterval] = useState<BillingInterval>('month')

  const starterIsCurrent = currentTier === 'starter'
  const proIsCurrent = currentTier === 'pro'

  const starterCta = useMemo(() => {
    if (starterIsCurrent) return { label: 'Current plan', disabled: true }
    if (mode === 'upgrade') return { label: 'Upgrade', disabled: false }
    return { label: 'Get Started', disabled: false }
  }, [mode, starterIsCurrent])

  const proCta = useMemo(() => {
    if (proIsCurrent) return { label: 'Current plan', disabled: true }
    if (mode === 'upgrade') return { label: 'Upgrade', disabled: false }
    return { label: 'Get Started', disabled: false }
  }, [mode, proIsCurrent])

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="text-3xl font-semibold tracking-tight">Choose Your Plan</div>
        <div className="text-muted-foreground">All plans include our core AI extraction technology.</div>
      </div>

      <BillingToggle value={interval} onChange={setInterval} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        {/* Starter */}
        <Card className="p-6 hover:translate-y-0 h-full flex flex-col">
          <div className="space-y-3 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div className="text-2xl font-semibold">{PRICING.starter.title}</div>
              {starterIsCurrent ? (
                <div className="rounded-full border border-border bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  CURRENT PLAN
                </div>
              ) : null}
            </div>
            <div className="text-sm text-muted-foreground">{PRICING.starter.desc}</div>

            {interval === 'month' ? (
              <div className="space-y-1">
                <div className="flex items-end gap-2">
                  <div className="text-muted-foreground line-through text-lg">${PRICING.starter.monthly.old}</div>
                  <div className="text-5xl font-semibold">${PRICING.starter.monthly.now}</div>
                  <div className="text-muted-foreground mb-2">/month</div>
                </div>
                <div className="text-sm text-muted-foreground">{PRICING.starter.monthly.note}</div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-end gap-2">
                  <div className="text-muted-foreground line-through text-lg">${PRICING.starter.yearly.old}</div>
                  <div className="text-5xl font-semibold">${PRICING.starter.yearly.perMonth}</div>
                  <div className="text-muted-foreground mb-2">/month</div>
                </div>
                <div className="text-sm text-muted-foreground">{PRICING.starter.yearly.note}</div>
              </div>
            )}

            <ul className="mt-4 space-y-3">
              {PRICING.starter.features.map((f) => (
                <FeatureItem key={f.label} included={f.included} label={f.label} />
              ))}
            </ul>
          </div>

          <div className="pt-6">
            <Button
              className="w-full"
              variant={starterIsCurrent ? 'secondary' : 'default'}
              disabled={starterCta.disabled}
              onClick={() => onSelect({ choice: 'starter', interval })}
            >
              {starterCta.label}
            </Button>
          </div>
        </Card>

        {/* Pro */}
        <div className="relative h-full">
          <div className="pointer-events-none absolute -top-3 left-1/2 z-10 -translate-x-1/2">
            <div className="rounded-full bg-foreground text-background px-3 py-1 text-[11px] font-semibold tracking-wide shadow-sm">
              {proIsCurrent ? 'CURRENT PLAN' : 'MOST POPULAR'}
            </div>
          </div>

          <Card className="p-6 border-primary/30 hover:translate-y-0 h-full flex flex-col">
            <div className="space-y-3 flex-1">
            <div className="text-2xl font-semibold">{PRICING.pro.title}</div>
            <div className="text-sm text-muted-foreground">{PRICING.pro.desc}</div>

            {interval === 'month' ? (
              <div className="space-y-1">
                <div className="flex items-end gap-2">
                  <div className="text-muted-foreground line-through text-lg">${PRICING.pro.monthly.old}</div>
                  <div className="text-5xl font-semibold">${PRICING.pro.monthly.now}</div>
                  <div className="text-muted-foreground mb-2">/month</div>
                </div>
                <div className="text-sm text-muted-foreground">{PRICING.pro.monthly.note}</div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-end gap-2">
                  <div className="text-muted-foreground line-through text-lg">${PRICING.pro.yearly.old}</div>
                  <div className="text-5xl font-semibold">${PRICING.pro.yearly.perMonth}</div>
                  <div className="text-muted-foreground mb-2">/month</div>
                </div>
                <div className="text-sm text-muted-foreground">{PRICING.pro.yearly.note}</div>
              </div>
            )}

            <ul className="mt-4 space-y-3">
              {PRICING.pro.features.map((f) => (
                <FeatureItem key={f.label} included={f.included} label={f.label} highlight={f.highlight} />
              ))}
            </ul>
          </div>

            <div className="pt-6">
              <Button
                className="w-full"
                variant={proIsCurrent ? 'secondary' : 'default'}
                disabled={proCta.disabled}
                onClick={() => onSelect({ choice: 'pro', interval })}
              >
                {proCta.label}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {showTrial && mode === 'onboarding' ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="text-xl font-semibold">{PRICING.trial.title}</div>
                <div className="rounded-full border border-border bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {PRICING.trial.badge}
                </div>
              </div>
              <div className="text-sm text-muted-foreground">{PRICING.trial.desc}</div>
              <div className="flex flex-wrap gap-3 text-sm text-foreground/80">
                {PRICING.trial.bullets.map((b) => (
                  <span key={b} className="inline-flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    {b}
                  </span>
                ))}
              </div>
            </div>
            <div className="shrink-0">
              <Button onClick={() => onSelect({ choice: 'trial' })} disabled={currentTier !== 'free' && currentTier !== 'pro_trial'}>
                Start Free Trial
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

