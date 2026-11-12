'use client'

import { useEffect } from 'react'
import { ContactButtons } from '@repo/ui/sc/contact-buttons'
import { SUPPORT_TEL_HREF, SUPPORT_WHATSAPP_HREF } from '@repo/core/support'
import { CrashScreen } from '@repo/ui/sc/crash-screen'
import { reportError } from '@/lib/monitoring'
import { useT } from '@repo/core/i18n'

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
  const t = useT()
  useEffect(() => {
    reportError(error)
  }, [error])

  return (
    <CrashScreen
      title={t('Something went wrong')}
      message={t('This page hit a problem on our side. Try again, or start over from home.')}
      onRetry={unstable_retry ?? reset}
      homeHref="/"
      homeLabel={t('Go to home')}
      reference={error.digest}
    >
      {/* A customer stuck on a crash may be mid-booking, so a person is one
          tap away. */}
      <p className="pb-3 text-t5 text-text-secondary">{t('Still stuck? Our team can help.')}</p>
      <ContactButtons
        who={t('Detlio support')}
        callHref={SUPPORT_TEL_HREF}
        whatsAppHref={SUPPORT_WHATSAPP_HREF}
      />
    </CrashScreen>
  )
}
