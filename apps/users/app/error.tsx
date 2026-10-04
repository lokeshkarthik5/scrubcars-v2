'use client'

import { useEffect } from 'react'
import { ContactButtons } from '@repo/ui/sc/contact-buttons'
import { SUPPORT_TEL_HREF, SUPPORT_WHATSAPP_HREF } from '@repo/core/support'
import { CrashScreen } from '@repo/ui/sc/crash-screen'
import { reportError } from '@/lib/monitoring'

/**
 * A page that threw while rendering. Next swaps it for this, inside the root
 * layout, and the rest of the app keeps working. Sent to Sentry when this
 * build has a DSN.
 *
 * `unstable_retry` re-fetches and re-renders the page; `reset` only
 * re-renders, and is what older Next versions pass.
 */
export default function ErrorPage({
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
  )
}
