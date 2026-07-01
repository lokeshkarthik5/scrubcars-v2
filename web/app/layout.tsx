import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { AppProvider } from '@/components/providers/app-provider'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Scrub Cars',
  description: 'Car care at your doorstep',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full font-sans">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  )
}
