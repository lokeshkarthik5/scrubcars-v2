'use client'

import { usePathname } from 'next/navigation'
import { useAdminGuaranteeConfig } from '@repo/core/api/hooks/use-guarantee'
import { shineOn, useShineConfig } from '@repo/core/api/hooks/use-shine-score'
import { SectionTabs } from '@/components/section-tabs'

/**
 * Issues: the three pages about customers' problems in one place with tabs
 * (UX audit, admin mockup 01). Redo claims only while the Guarantee is on,
 * Shine checks (0078) only while Shine Score is.
 */
export function IssuesTabs() {
  const pathname = usePathname()
  const { data: guarantee } = useAdminGuaranteeConfig()
  const { data: shine } = useShineConfig()
  const tabs = [
    { href: '/complaints', label: 'Complaints' },
    ...(guarantee?.enabled
      ? [{ href: '/guarantee', label: 'Redo claims' }]
      : []),
    { href: '/bypass-reports', label: 'Bypass reports' },
    ...(shineOn(shine) ? [{ href: '/shine-checks', label: 'Shine checks' }] : []),
  ]
  return (
    <SectionTabs
      label="Issues sections"
      tabs={tabs.map((tab) => ({
        ...tab,
        active: pathname === tab.href || pathname.startsWith(`${tab.href}/`),
      }))}
    />
  )
}
