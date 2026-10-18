'use client'

import Link from 'next/link'
import { IconChevronRight, IconFlag } from '@tabler/icons-react'
import { ScCard } from '@repo/ui/sc/card'
import { useGarageStrikes } from '@repo/core/api/hooks/use-bypass-reports'
import { strikesLabel } from '@repo/core/bypass-reports'
import { cn } from '@repo/core/utils'

/**
 * The garage page's bypass reports (0052): its strikes (confirmed reports of
 * the last 180 days; 2 or more in red, and any one takes Detlio Certified
 * off the table) and reports still to look into. Nothing at all for a garage
 * nobody has reported. Read on its own, so a failure leaves the page whole.
 */
export function GarageStrikesCard({ vendorId }: { vendorId: string }) {
  const { data } = useGarageStrikes(vendorId)
  if (!data || (data.strikes === 0 && data.newReports === 0)) return null

  return (
    <ScCard className={cn('flex flex-col gap-1.5', data.highlighted && 'border-error/60')}>
      <p className={cn('flex items-center gap-1.5 text-[13px] font-semibold', data.highlighted ? 'text-error' : 'text-text-primary')}>
        <IconFlag size={16} aria-hidden className="shrink-0" />
        <span>
          <span className="font-numeric">{strikesLabel(data.strikes)}</span>
          <span className="font-normal text-text-secondary"> · bypass reports confirmed in the last {data.windowDays} days</span>
        </span>
      </p>
      {data.strikes > 0 && (
        <p className="text-[12px] text-text-secondary">
          Not eligible for Detlio Certified while it has a strike.
          {data.highlighted && ' Talk to the garage about its agreement, or pause or suspend it.'}
        </p>
      )}
      <Link
        href={data.newReports > 0 ? '/bypass-reports' : '/bypass-reports?show=confirmed'}
        className="flex min-h-11 items-center gap-1 self-start text-[12px] font-medium text-text-primary underline-offset-2 hover:underline"
      >
        {data.newReports > 0 ? (
          <span>
            <span className="font-numeric">{data.newReports}</span> new {data.newReports === 1 ? 'report' : 'reports'} to look into
          </span>
        ) : (
          'See the reports'
        )}
        <IconChevronRight size={15} aria-hidden className="text-text-muted" />
      </Link>
    </ScCard>
  )
}
