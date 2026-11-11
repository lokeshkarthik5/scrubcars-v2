'use client'

import { ScBadge } from './badge'
import { useT } from '@repo/core/i18n'

/** The mark on a line that is an add-on (0068), so it isn't taken for a service. */
export function AddOnMark({ className }: { className?: string }) {
  const t = useT()
  return <ScBadge className={className}>{t('Add-on')}</ScBadge>
}
