'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type LoaderMode = 'threeDots' | 'none'

interface ExtractingInlineIndicatorProps {
  text?: string
  variant?: 'extracting' | 'failed'
  title?: string
  className?: string

  // Loading polish
  loader?: LoaderMode
  rotate?: boolean
  seed?: string
  words?: string[]
}

function hashStringToUint32(input: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  // Deterministic PRNG
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export default function ExtractingInlineIndicator({
  text = 'extracting',
  variant = 'extracting',
  title,
  className = '',
  loader = 'threeDots',
  rotate = true,
  seed,
  words,
}: ExtractingInlineIndicatorProps) {
  const defaultWords = useMemo(
    () => ['extracting', 'reading', 'processing', 'parsing', 'scanning', 'indexing'],
    []
  )

  const activeWords = useMemo(() => {
    const w = Array.isArray(words) && words.length > 0 ? words : defaultWords
    return w.filter((x) => typeof x === 'string' && x.trim().length > 0)
  }, [words, defaultWords])

  const effectiveSeed = useMemo(() => seed ?? `fallback:${text}:${variant}`, [seed, text, variant])
  const rngRef = useRef<ReturnType<typeof mulberry32> | null>(null)

  const [label, setLabel] = useState(text)

  // Initialize label deterministically for this cell.
  useEffect(() => {
    if (variant !== 'extracting') {
      setLabel(text)
      return
    }
    if (!rotate || activeWords.length === 0) {
      setLabel(text)
      return
    }
    const rng = mulberry32(hashStringToUint32(effectiveSeed))
    rngRef.current = rng
    const idx = Math.floor(rng() * activeWords.length)
    setLabel(activeWords[idx] ?? text)
  }, [activeWords, effectiveSeed, rotate, text, variant])

  // Rotate over time with deterministic jitter per cell.
  useEffect(() => {
    if (variant !== 'extracting') return
    if (!rotate) return
    if (activeWords.length <= 1) return

    const rng = rngRef.current ?? mulberry32(hashStringToUint32(effectiveSeed))
    rngRef.current = rng

    let cancelled = false
    let idx = Math.max(0, activeWords.indexOf(label))
    if (idx === -1) idx = 0

    const tick = () => {
      if (cancelled) return
      // 1500–3000ms, plus small per-tick jitter to avoid “metronome” feel.
      const base = 1500 + Math.floor(rng() * 1500)
      const jitter = Math.floor(rng() * 500)
      const delay = base + jitter

      window.setTimeout(() => {
        if (cancelled) return
        // Step forward 1–2 positions sometimes, to break patterns.
        const step = rng() < 0.25 ? 2 : 1
        idx = (idx + step) % activeWords.length
        setLabel(activeWords[idx])
        tick()
      }, delay)
    }

    tick()
    return () => {
      cancelled = true
    }
    // Intentionally omit `label` so we don't re-arm timers on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWords, effectiveSeed, rotate, variant])

  const isFailed = variant === 'failed'

  const textClass = isFailed ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'

  const dotBase =
    'h-1.5 w-1.5 rounded-full motion-reduce:animate-none transition-opacity will-change-transform ring-1 ring-inset'

  // Theme-aware “green”: use your `primary` token (OKLCH), plus subtle ring for contrast in both themes.
  const dotClass = isFailed
    ? `${dotBase} bg-destructive/80 ring-destructive/35`
    : `${dotBase} bg-primary/70 ring-primary/30 dark:bg-primary/80 dark:ring-primary/35`

  return (
    <span
      role="status"
      aria-live="polite"
      title={title}
      className={`inline-flex items-center gap-2 ${textClass} ${className}`}
    >
      {loader === 'threeDots' && !isFailed ? (
        <span aria-hidden="true" className="inline-flex items-center gap-1">
          <span className={`${dotClass} animate-bounce [animation-duration:900ms]`} />
          <span className={`${dotClass} animate-bounce [animation-duration:900ms] [animation-delay:120ms] opacity-90`} />
          <span className={`${dotClass} animate-bounce [animation-duration:900ms] [animation-delay:240ms] opacity-80`} />
        </span>
      ) : (
        <span aria-hidden="true" className={dotClass} />
      )}
      <span>{isFailed ? text : label}</span>
    </span>
  )
}

