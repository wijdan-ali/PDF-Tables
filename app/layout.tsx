import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { antic } from '@/app/fonts'
import { SpeedInsights } from '@vercel/speed-insights/next'

export const metadata: Metadata = {
  title: 'PDF Tables - AI-Powered Data Extractor',
  description: 'Extract structured data from PDFs using AI',
  manifest: '/favicons.ico/manifest.json',
  themeColor: '#ffffff',
  icons: {
    icon: [
      { url: '/favicons.ico/favicon.ico' },
      { url: '/favicons.ico/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicons.ico/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicons.ico/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicons.ico/android-icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/favicons.ico/apple-icon-57x57.png', sizes: '57x57', type: 'image/png' },
      { url: '/favicons.ico/apple-icon-60x60.png', sizes: '60x60', type: 'image/png' },
      { url: '/favicons.ico/apple-icon-72x72.png', sizes: '72x72', type: 'image/png' },
      { url: '/favicons.ico/apple-icon-76x76.png', sizes: '76x76', type: 'image/png' },
      { url: '/favicons.ico/apple-icon-114x114.png', sizes: '114x114', type: 'image/png' },
      { url: '/favicons.ico/apple-icon-120x120.png', sizes: '120x120', type: 'image/png' },
      { url: '/favicons.ico/apple-icon-144x144.png', sizes: '144x144', type: 'image/png' },
      { url: '/favicons.ico/apple-icon-152x152.png', sizes: '152x152', type: 'image/png' },
      { url: '/favicons.ico/apple-icon-180x180.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  other: {
    'msapplication-TileColor': '#ffffff',
    'msapplication-TileImage': '/favicons.ico/ms-icon-144x144.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className={antic.variable}>
      <head>
        <meta name="msapplication-config" content="/favicons.ico/browserconfig.xml" />
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  )
}

