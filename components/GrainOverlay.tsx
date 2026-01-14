import React from 'react'

const DEFAULT_SVG_DATA_URL =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`

export default function GrainOverlay({
  className = '',
  opacity = 0.14,
  darkOpacity,
  scalePx = 40,
  contrast = 1.0,
  brightness = 1.0,
  darkContrast,
  darkBrightness,
}: {
  className?: string
  opacity?: number
  darkOpacity?: number
  scalePx?: number
  contrast?: number
  brightness?: number
  darkContrast?: number
  darkBrightness?: number
}) {
  const baseStyle: React.CSSProperties = {
    backgroundImage: DEFAULT_SVG_DATA_URL,
    backgroundRepeat: 'repeat',
    backgroundSize: `${Math.max(8, scalePx)}px ${Math.max(8, scalePx)}px`,
    mixBlendMode: 'soft-light',
  }

  // If no explicit darkOpacity is provided, render a single layer (caller controls it).
  if (typeof darkOpacity !== 'number') {
    return (
      <div
        className={['absolute inset-0 pointer-events-none', className].join(' ')}
        style={{
          ...baseStyle,
          opacity,
          filter: `contrast(${contrast}) brightness(${brightness})`,
        }}
      />
    )
  }

  return (
    <>
      <div
        className={['absolute inset-0 pointer-events-none dark:opacity-0', className].join(' ')}
        style={{
          ...baseStyle,
          opacity,
          filter: `contrast(${contrast}) brightness(${brightness})`,
        }}
      />
      <div
        className={['absolute inset-0 pointer-events-none opacity-0 dark:opacity-100', className].join(' ')}
        style={{
          ...baseStyle,
          opacity: darkOpacity,
          filter: `contrast(${darkContrast ?? contrast}) brightness(${darkBrightness ?? brightness})`,
        }}
      />
    </>
  )
}

