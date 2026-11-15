'use client'

import { usePathname } from 'next/navigation'
import { repairQuotesOn, useRepairQuotesConfig } from '@repo/core/api/hooks/use-repair-quotes'
import { SectionTabs } from '@/components/section-tabs'

/**
 * Requests: visit requests and, while repair quotes are on (0075), the
 * customers' repair quote requests, as two tabs. Nothing while they are off:
 * Requests is one page, as before.
 */
export function RequestsTabs() {
  const pathname = usePathname()
  const config = useRepairQuotesConfig()
  if (!repairQuotesOn(config.data)) return null
  return (
    <SectionTabs
      label="Requests sections"
      tabs={[
        { href: '/requests', label: 'Visit requests', active: pathname === '/requests' },
        { href: '/requests/repair-quotes', label: 'Repair quotes', active: pathname.startsWith('/requests/repair-quotes') },
      ]}
    />
  )
}
