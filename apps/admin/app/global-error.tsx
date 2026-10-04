'use client'

import { useEffect } from 'react'
import { Inter } from 'next/font/google'
import { CrashScreen } from '@repo/ui/sc/crash-screen'
import { reportError } from '@/lib/monitoring'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

/**
 * The last line of defence: the root layout itself threw, so this replaces
 * the whole document and brings its own <html>, fonts and styles. Rare, and
 * the reason crash reporting exists — sent to Sentry when this build has a
 * DSN.
 */
export default function GlobalError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  reset: () => void
  unstable_retry?: () => void
}) {
  useEffect(() => {
    reportError(error)
  }, [error])

  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full bg-brand-black font-sans">
        <title>Something went wrong · Detlio</title>
        <CrashScreen
          title="Something went wrong"
          message="This page hit a problem on our side. Try again, or start over from admin home."
          onRetry={unstable_retry ?? reset}
          homeHref="/vendors"
          homeLabel="Go to admin home"
          reference={error.digest}
        />
      </body>
    </html>
  )
}
