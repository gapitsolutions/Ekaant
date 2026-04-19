import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { AuthProvider } from '@/lib/auth-context'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

export const metadata: Metadata = {
  title: 'Help Nasha Mukti Hospital Samana',
  description: 'Comprehensive patient management system for Help Nasha Mukti Hospital Samana',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  themeColor: '#0d7377',
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
