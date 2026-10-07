'use client'

import { useEffect } from 'react'
import { Inter, Space_Grotesk } from 'next/font/google'
import { ContactButtons } from '@repo/ui/sc/contact-buttons'
import { SUPPORT_TEL_HREF, SUPPORT_WHATSAPP_HREF } from '@repo/core/support'
import { CrashScreen } from '@repo/ui/sc/crash-screen'
import { reportError } from '@/lib/monitoring'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '700'],
  variable: '--font-space-grotesk',
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
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} h-full`}>
      <body className="min-h-full bg-brand-black font-sans">
        <title>Something went wrong · Detlio</title>
        <CrashScreen
          title="Something went wrong"
          message="This page hit a problem on our side. Try again, or start over from home."
          onRetry={unstable_retry ?? reset}
          homeHref="/"
          homeLabel="Go to home"
          reference={error.digest}
        >
          {/* A customer stuck on a crash may be mid-booking, so a person is one
              tap away. */}
          <p className="pb-3 text-[12px] text-text-secondary">Still stuck? Our team can help.</p>
          <ContactButtons
            who="Detlio support"
            callHref={SUPPORT_TEL_HREF}
            whatsAppHref={SUPPORT_WHATSAPP_HREF}
          />
        </CrashScreen>
      </body>
    </html>
  )
}
