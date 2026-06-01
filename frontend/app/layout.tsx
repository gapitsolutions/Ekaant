import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { AuthProvider } from '@/lib/auth-context'
import { Toaster } from '@/components/ui/sonner'
import { BRANDING } from '@/lib/branding'
import './globals.css'

export const metadata: Metadata = {
  title: BRANDING.name,
  description: `${BRANDING.tagline} for ${BRANDING.name}`,
  generator: 'v0.app',
  icons: {
    icon: BRANDING.faviconPath,
    apple: BRANDING.faviconPath,
  },
}

export const viewport: Viewport = {
  themeColor: BRANDING.colors.primary,
}

// SSR'd <style> block that drives the brand-color CSS variables from
// ``BRANDING.colors``. The hex values are baked at build time from the
// ``NEXT_PUBLIC_BRANDING_*`` env vars, but consumers only ever see the
// CSS variables — change ``branding.ts`` and the whole UI re-tints
// without touching component styles or globals.css.
const BRAND_CSS_VARS = `:root,.dark{` +
  `--primary:${BRANDING.colors.primary};` +
  `--primary-dark:${BRANDING.colors.primaryDark};` +
  `--primary-accent:${BRANDING.colors.primaryAccent};` +
  `--primary-accent-dark:${BRANDING.colors.primaryAccentDark};` +
  `}`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: BRAND_CSS_VARS }} />
      </head>
      <body className="font-sans antialiased">
        <AuthProvider>
          {children}
          <Toaster position="top-right" />
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}
