'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ScCard } from '@repo/ui/sc/card'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { Skeleton } from '@repo/ui/sc/skeleton'
import type { StatsCommission } from '@repo/core/api/admin'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { useStatsCommission } from '@repo/core/api/hooks/use-admin-stats'
import { cn } from '@repo/core/utils'
import { HowWeCount } from '@/components/statistics/how-we-count'
import {
  categoryList,
  dayLabel,
  plural,
  rangeLabel,
  rupees,
  type DateRange,
} from '@/lib/statistics'

const HOW_WE_COUNT = [
  'By the day the booking was made, on bookings that earn the garage its payout: finished jobs and customer no-shows.',
  'On the full price of each service: before a promo Detlio pays for, after a discount the garage gives. A final bill is charged at the rate of the service it was for.',
  'The free 25 count every booking the garage received, cancelled ones too, from its first. Test bookings are left out.',
  'A service with its own commission % (set in the garage’s services) is charged at that rate here instead of its category’s.',
  'For reporting only: payouts, earnings and what garages see are unchanged.',
]

function Rules({ rules }: { rules: StatsCommission['rules'] }) {
  const highest = Math.max(...rules.rates.map((r) => r.rate))
  return (
    <ScCard className="px-4 pb-1 pt-4">
      <h2 className="text-[15px] font-medium tracking-tight text-text-primary">
        Commission
      </h2>
      <p className="mt-0.5 text-[12px] text-text-secondary">
        The agreed rates, for reporting only: payouts are unchanged
      </p>
      <ul className="mt-3.5">
        {rules.rates.map(({ rate, categories }) => (
          <li
            key={rate}
            className="flex items-start gap-3.5 border-t border-border py-3.5"
          >
            <span className="w-[52px] shrink-0 font-numeric text-[26px] font-medium leading-7 tracking-tight text-text-primary">
              {Math.round(rate * 1000) / 10}%
            </span>
            <span>
              <b className="block text-[14px] font-medium leading-5 text-text-primary">
                {categoryList(categories)}
              </b>
              <span className="mt-0.5 block text-[12px] leading-[1.45] text-text-secondary">
                {rate === highest
                  ? 'Washes and other everyday services.'
                  : 'The high-ticket work.'}
              </span>
            </span>
          </li>
        ))}
        <li className="flex items-start gap-3.5 border-t border-border py-3.5">
          <span className="w-[52px] shrink-0 font-numeric text-[26px] font-medium leading-7 tracking-tight text-text-primary">
            {rules.freeBookings}
          </span>
          <span>
            <b className="block text-[14px] font-medium leading-5 text-text-primary">
              First {rules.freeBookings} bookings are free
            </b>
            <span className="mt-0.5 block text-[12px] leading-[1.45] text-text-secondary">
              No commission on each garage’s first {rules.freeBookings}{' '}
              bookings, cancelled ones included. It starts from the{' '}
              {rules.freeBookings + 1}th.
            </span>
          </span>
        </li>
      </ul>
    </ScCard>
  )
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="border-b border-border pb-2 pt-5 text-[12px] font-medium text-text-secondary">
      {children}
    </h3>
  )
}

function Month({
  commission,
  title,
}: {
  commission: StatsCommission
  /** "Commission in October so far". */
  title: string
}) {
  const { active, free, rules } = commission
  return (
    <ScCard className="px-4 pb-1 pt-4">
      <p className="text-[12px] font-medium text-text-secondary">{title}</p>
      <p className="mt-1 font-numeric text-[34px] font-medium leading-10 tracking-tight text-text-primary">
        {rupees(commission.commission)}
      </p>
      <p className="mt-0.5 text-[12px] text-text-secondary">
        {rangeLabel(commission.range)} · from{' '}
        <span className="font-numeric">{rupees(commission.collected)}</span>{' '}
        collected
      </p>

      {active.length > 0 && (
        <section aria-label="Commission active">
          <GroupHeading>
            Commission active ·{' '}
            <span className="font-numeric">{active.length}</span>
          </GroupHeading>
          <ul>
            {active.map((garage) => (
              <li
                key={garage.vendorId}
                className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13px] font-normal leading-[18px] text-text-primary">
                    {garage.name}
                  </b>
                  <small className="mt-0.5 block text-[12px] text-text-muted">
                    {plural(garage.bookings, 'booking', 'bookings')}
                    {garage.activeSince &&
                      ` · active since ${dayLabel(garage.activeSince)}`}
                  </small>
                </span>
                <span className="shrink-0 font-numeric text-[14px] font-medium tabular-nums text-text-primary">
                  {rupees(garage.commission)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {free.length > 0 && (
        <section aria-label="In free period">
          <GroupHeading>
            In free period · <span className="font-numeric">{free.length}</span>
          </GroupHeading>
          <ul>
            {free.map((garage) => (
              <li
                key={garage.vendorId}
                className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13px] font-normal leading-[18px] text-text-primary">
                    {garage.name}
                  </b>
                  <span
                    aria-hidden="true"
                    className="mt-2 block h-1 max-w-[200px] overflow-hidden rounded-full bg-white/[0.08]"
                  >
                    <i
                      className="block h-full rounded-full bg-[#E4E4E7]"
                      style={{
                        width: `${(garage.used / rules.freeBookings) * 100}%`,
                      }}
                    />
                  </span>
                  <small className="mt-1.5 block text-[12px] text-text-muted">
                    <span className="font-numeric">
                      {garage.used} of {rules.freeBookings}
                    </span>{' '}
                    free bookings used ·{' '}
                    <span className="font-numeric">{garage.left}</span> left
                  </small>
                </span>
                <span className="shrink-0 text-[12px] text-text-muted">
                  Free
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {active.length === 0 && free.length === 0 && (
        <p className="py-4 text-[13px] text-text-secondary">
          No garage has had a booking yet.
        </p>
      )}
    </ScCard>
  )
}

/**
 * The Commission tab: the rule in plain words, Detlio's commission for the
 * month, and which garages pay it and which are still in their free 25.
 * Reporting only: nothing here changes what a garage is paid.
 */
export function CommissionTab({
  range,
  vendorId,
  title,
}: {
  range: DateRange
  vendorId: string
  title: string
}) {
  const router = useRouter()
  const stats = useStatsCommission({
    ...range,
    vendorId: vendorId || undefined,
  })

  useEffect(() => {
    if (isAuthError(stats.error)) router.replace('/login')
  }, [stats.error, router])

  if (!stats.data) {
    return stats.isError ? (
      <ErrorState
        message={errorMessage(stats.error, "Couldn't load the commission.")}
        onRetry={() => void stats.refetch()}
      />
    ) : (
      <div role="status" aria-busy="true" className="flex flex-col gap-5">
        <span className="sr-only">Loading</span>
        <Skeleton className="h-[300px]" />
        <Skeleton className="h-[420px]" />
      </div>
    )
  }

  return (
    <>
      <div
        aria-busy={stats.isFetching || undefined}
        className={cn(
          'flex flex-col gap-5 transition-opacity',
          stats.isPlaceholderData && 'opacity-60'
        )}
      >
        <Rules rules={stats.data.rules} />
        <Month commission={stats.data} title={title} />
      </div>
      <HowWeCount lines={HOW_WE_COUNT} />
    </>
  )
}
