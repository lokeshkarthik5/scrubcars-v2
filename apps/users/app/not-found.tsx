'use client'

import { ContactButtons } from '@repo/ui/sc/contact-buttons'
import { SUPPORT_TEL_HREF, SUPPORT_WHATSAPP_HREF } from '@repo/core/support'
import { CrashScreen } from '@repo/ui/sc/crash-screen'
import { useT } from '@repo/core/i18n'

/**
 * Any URL with no page behind it, in this app's own look. A client component,
 * so its words follow Profile → Language.
 */
export default function NotFound() {
  const t = useT()
  return (
    <CrashScreen
      title={t('Page not found')}
      message={t("This page doesn't exist or has moved.")}
      homeHref="/"
      homeLabel={t('Go to home')}
    >
      {/* A dead link from a message or an old bookmark: a person can point
          the way. */}
      <p className="pb-3 text-t5 text-text-secondary">{t('Looking for something? Our team can help.')}</p>
      <ContactButtons
        who={t('Detlio support')}
        callHref={SUPPORT_TEL_HREF}
        whatsAppHref={SUPPORT_WHATSAPP_HREF}
      />
    </CrashScreen>
  )
}
