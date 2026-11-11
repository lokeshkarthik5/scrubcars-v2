'use client'

import type { ReactNode } from 'react'
import { openConsentSettings } from '@/lib/consent'
import { useT } from '@repo/core/i18n'

/**
 * "Cookie settings": opens the cookie question (ConsentBanner) again, so the
 * choice can be changed as easily as it was made. A button, styled by the
 * caller to sit among its links (Profile's Legal group, the site footer).
 */
export function CookieSettingsButton({
  className,
  children,
}: {
  className?: string
  children?: ReactNode
}) {
  const t = useT()
  return (
    <button type="button" onClick={openConsentSettings} className={className}>
      {children ?? t('Cookie settings')}
    </button>
  )
}
