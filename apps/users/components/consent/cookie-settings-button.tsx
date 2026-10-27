'use client'

import type { ReactNode } from 'react'
import { openConsentSettings } from '@/lib/consent'

/**
 * "Cookie settings": opens the cookie question (ConsentBanner) again, so the
 * choice can be changed as easily as it was made. A button, styled by the
 * caller to sit among its links (Profile's Legal group, the site footer).
 */
export function CookieSettingsButton({
  className,
  children = 'Cookie settings',
}: {
  className?: string
  children?: ReactNode
}) {
  return (
    <button type="button" onClick={openConsentSettings} className={className}>
      {children}
    </button>
  )
}
