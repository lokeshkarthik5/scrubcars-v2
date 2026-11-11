'use client'

import { useT } from '@repo/core/i18n'
import { CrashScreen } from '@repo/ui/sc/crash-screen'

/**
 * Any URL with no page behind it, in this app's own look. A client component
 * so its words follow the Language row.
 */
export default function NotFound() {
  const t = useT()
  return (
    <CrashScreen
      title={t('Page not found')}
      message={t("This page doesn't exist or has moved.")}
      homeHref="/home"
      homeLabel={t('Go to your dashboard')}
    />
  )
}
