import { Antic } from 'next/font/google'

export const antic = Antic({
  weight: ['400'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-antic',
})

/**
 * SF Pro Display (Apple proprietary font)
 * --------------------------------------
 * Apple’s SF Pro fonts are licensed; you must provide the font files yourself.
 *
 * Place these files (recommended: woff2) under:
 *   public/fonts/sf-pro-display/
 *
 * This app uses a safe fallback approach:
 * - `app/globals.css` declares @font-face for SF Pro Display weights (400/500/600/700).
 * - If the files exist, the browser will use them.
 * - Otherwise, macOS will use the system SF Pro Display, and other OSes will fall back.
 *
 * IMPORTANT: This is intentionally commented out so the build won't break until files exist.
 */
/*
import localFont from 'next/font/local'

export const sfProDisplay = localFont({
  src: [
    { path: '../public/fonts/sf-pro-display/SFProDisplay-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/sf-pro-display/SFProDisplay-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/sf-pro-display/SFProDisplay-Bold.woff2', weight: '700', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-sf-pro-display',
})
*/

/**
 * CSS variable used by `app/globals.css` for the app's primary UI font stack.
 */
export const sfProDisplayCssVariable = '--font-sf-pro-display'
