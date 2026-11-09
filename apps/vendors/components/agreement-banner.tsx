'use client'

import { useT } from '@repo/core/i18n'
import { Notice } from '@repo/ui/sc/notice'
import { useGarageAgreement } from '@repo/core/api/hooks/use-tiers'
import { agreementBannerLine } from '@repo/core/agreements'

/**
 * Home's banner while the owner has a garage agreement version to accept
 * (0063): never accepted, or a new version in its 30 days. Opens the
 * agreement screen. Nothing once accepted, before Detlio publishes one, or
 * when the read fails (an API from before the agreement).
 */
export function AgreementBanner({ vendorId }: { vendorId: string | undefined }) {
  const t = useT()
  const { data } = useGarageAgreement(vendorId)
  if (!data) return null
  const line = agreementBannerLine(data.standing)
  if (!line) return null
  return (
    <Notice href="/agreement" title={t('Accept the Detlio garage agreement')}>
      {line}
    </Notice>
  )
}
