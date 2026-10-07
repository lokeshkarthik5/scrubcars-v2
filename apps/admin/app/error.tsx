'use client'

import { useEffect } from 'react'
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
      message="This page hit a problem on our side. Try again, or start over from admin home."
      onRetry={unstable_retry ?? reset}
      homeHref="/vendors"
      homeLabel="Go to admin home"
      reference={error.digest}
      inChrome
    />
  )
}
