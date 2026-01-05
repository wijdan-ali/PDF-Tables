# Silk Sidebar Effect (reference)

This document captures the **exact “Silk + blur + adjustable grain”** background stack used in this repo’s sidebar, so you can replicate it later.

## Files involved

- `components/Silk/Silk.tsx`: the Silk shader/canvas component (client-only).
- `app/components/Sidebar.tsx`: layer stack (Silk → blur → grain).

## 1) Silk component (client-only)

- Marked as a client component so it never runs on the server:

```1:8:components/Silk/Silk.tsx
 'use client'

/* eslint-disable react/no-unknown-property */
import React, { forwardRef, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, RootState, useFrame, useThree } from '@react-three/fiber'
import { Color, Mesh, ShaderMaterial } from 'three'
import { IUniform } from 'three'
```

- The shader uses the **original React Bits noise term**:

```70:86:components/Silk/Silk.tsx
void main() {
  float rnd        = noise(gl_FragCoord.xy);
  vec2  uv         = rotateUvs(vUv * uScale, uRotation);
  vec2  tex        = uv * uScale;
  float tOffset    = uSpeed * uTime;

  tex.y += 0.03 * sin(8.0 * tex.x - tOffset);

  float pattern = 0.6 +
                  0.4 * sin(5.0 * (tex.x + tex.y +
                                   cos(3.0 * tex.x + 5.0 * tex.y) +
                                   0.02 * tOffset) +
                           sin(20.0 * (tex.x + tex.y - 0.1 * tOffset)));

  vec4 col = vec4(uColor, 1.0) * vec4(pattern) - rnd / 15.0 * uNoiseIntensity;
  col.a = 1.0;
  gl_FragColor = col;
}
```

## 2) Sidebar usage (SSR-safe) + layer stack

`three` must not be imported into the server runtime, so in the sidebar we load Silk with `next/dynamic`:

```1:12:app/components/Sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { junicode } from '@/app/fonts'
import dynamic from 'next/dynamic'

const Silk = dynamic(() => import('@/components/Silk/Silk'), { ssr: false })
```

### Layer order (bottom → top)

1. **Silk canvas**
2. **Glass blur layer** (`backdrop-blur`)
3. **Adjustable grain layer** (procedural noise via SVG turbulence)
4. Sidebar UI content (text/buttons)

The background stack is implemented like this:

```129:151:app/components/Sidebar.tsx
    <aside className="fixed left-0 top-0 bottom-0 w-80 z-50">
      <div className="relative h-full overflow-hidden rounded-tr-[28px] rounded-br-[28px] border-r border-white/15">
        {/* Background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-tr-[28px] rounded-br-[28px]">
          <Silk speed={2.0} scale={0.6} color="#5B6180" noiseIntensity={0.0} rotation={1.9} />
          {/* Glass blur layer over Silk */}
          <div className="absolute inset-0 rounded-tr-[28px] rounded-br-[28px] bg-white/[0.02] backdrop-blur-[45px] backdrop-saturate-[1.25]" />
          {/* Extra grain layer ABOVE blur (tweak SIDEBAR_GRAIN_* constants) */}
          <div
            className="absolute inset-0 rounded-tr-[28px] rounded-br-[28px]"
            style={{
              opacity: SIDEBAR_GRAIN_OPACITY,
              // Real noise via SVG turbulence (stronger + more natural than repeating lines)
              backgroundImage:
                `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'repeat',
              backgroundSize: `${Math.max(8, SIDEBAR_GRAIN_SCALE_PX)}px ${Math.max(8, SIDEBAR_GRAIN_SCALE_PX)}px`,
              mixBlendMode: 'soft-light',
              filter: `contrast(${SIDEBAR_GRAIN_CONTRAST}) brightness(${SIDEBAR_GRAIN_BRIGHTNESS})`,
            }}
          />
        </div>
```

## 3) Adjustable knobs (grain overlay)

In `app/components/Sidebar.tsx`:

```23:30:app/components/Sidebar.tsx
// Tune these to control the extra grain layer (separate from Silk's noiseIntensity).
const SIDEBAR_GRAIN_OPACITY = 1.0
// Size of the grain tile in px (larger = chunkier grain, smaller = finer grain)
const SIDEBAR_GRAIN_SCALE_PX = 40
// Visual strength (higher = harsher grain)
const SIDEBAR_GRAIN_CONTRAST = 1.0
const SIDEBAR_GRAIN_BRIGHTNESS = 1.0
```

### Quick tuning guidance

- **More visible grain**: increase `SIDEBAR_GRAIN_CONTRAST` (e.g. `2.0`–`4.0`)
- **Chunkier grain**: increase `SIDEBAR_GRAIN_SCALE_PX` (e.g. `60`–`140`)
- **Finer grain**: decrease `SIDEBAR_GRAIN_SCALE_PX` (e.g. `12`–`40`)
- **Overall strength**: tweak `SIDEBAR_GRAIN_OPACITY` (e.g. `0.1`–`1.0`)

## Notes

- The blur and grain divs must be **clipped** to the sidebar corner radius; that’s why the background wrapper has `overflow-hidden` + matching `rounded-tr/rounded-br`.
- If you want Silk’s own shader-noise to show through blur, raise `noiseIntensity` on `<Silk />`. If blur obscures it, keep shader noise low and use the grain layer instead.


