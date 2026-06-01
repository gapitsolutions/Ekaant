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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
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
