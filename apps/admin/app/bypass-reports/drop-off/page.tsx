'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconUserMinus } from '@tabler/icons-react'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScCard } from '@repo/ui/sc/card'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { PageHeader } from '@repo/ui/sc/page-header'
import { SectionHeader } from '@repo/ui/sc/section-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { useDropOff } from '@repo/core/api/hooks/use-bypass-reports'
import { strikesLabel } from '@repo/core/bypass-reports'
import { cn } from '@repo/core/utils'
import { PhoneLink } from '@/components/phone-link'
import { formatWhen } from '@/lib/bookings'
import { dropOffRulesLine, quietLine, ratePercent } from '@/lib/bypass-reports'

/**
 * Customer drop-off (0052): regular customers of a garage who went quiet on
 * Detlio, per garage and one by one. Worked out by the server when the page
 * is opened (lib/drop-off.ts); nobody but the team sees it. A high rate is a
 * reason to look, not proof: a customer may have moved or sold the car.
 */
export default function DropOffPage() {
  const router = useRouter()
  const { data, isPending, error, refetch } = useDropOff()

  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  return (
    <>
      <PageHeader
        title="Customer drop-off"
        subtitle="Regular customers of a garage who stopped booking anywhere on Detlio — sometimes a sign the garage took them off the app."
        backHref="/bypass-reports"
      />

      {isPending ? (
        <SkeletonList count={3} itemClassName="h-24" />
      ) : error || !data ? (
        <ErrorState message={errorMessage(error, 'Failed to work out drop-off')} onRetry={() => void refetch()} />
      ) : (
        <>
          <p className="text-[12px] leading-[1.45] text-text-muted">
            {dropOffRulesLine(data.rules)} A high rate is a reason to look, not proof.
            {data.truncated && ' More bookings than one read takes: these figures may be low.'}
          </p>

          <section className="flex flex-col gap-2">
            <SectionHeader title="By garage" />
            {data.garages.length === 0 ? (
              <EmptyState
                icon={<IconUserMinus size={32} stroke={1.5} />}
                title="No regulars yet"
                subtitle={`A garage shows up here once a customer has completed ${data.rules.regularMinCompleted} bookings there in ${data.rules.regularWindowDays} days.`}
              />
            ) : (
              <ul className="flex flex-col gap-2" aria-label="Garages by drop-off rate">
                {data.garages.map((g) => (
                  <li key={g.vendorId}>
                    <ScCard className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5', g.flagged && 'border-warning/60')}>
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <Link
                          href={`/vendors/${g.vendorId}/edit`}
                          className="truncate text-[14px] font-semibold text-text-primary underline-offset-2 hover:underline"
                        >
                          {g.name}
                        </Link>
                        {g.flagged && <ScBadge variant="danger">High drop-off</ScBadge>}
                        {g.strikes > 0 && (
                          <ScBadge variant={g.strikes >= 2 ? 'danger' : 'muted'}>
                            <span className="font-numeric">{strikesLabel(g.strikes)}</span>
                          </ScBadge>
                        )}
                        {g.inBin && <ScBadge variant="muted">In the Bin</ScBadge>}
                      </div>
                      <p className="text-[12px] text-text-secondary">
                        <span className={cn('font-numeric font-semibold', g.flagged ? 'text-warning' : 'text-text-primary')}>
                          {ratePercent(g.rate)}
                        </span>{' '}
                        went quiet ·{' '}
                        <span className="font-numeric">
                          {g.wentQuiet} of {g.regulars}
                        </span>{' '}
                        {g.regulars === 1 ? 'regular' : 'regulars'}
                      </p>
                    </ScCard>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.quiet.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionHeader title="Regulars who went quiet" />
              <ul className="flex flex-col gap-2" aria-label="Regulars who went quiet">
                {data.quiet.map((row) => (
                  <li key={`${row.vendorId}:${row.customer.id}`}>
                    <ScCard className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <p className="min-w-0 truncate text-[13px] font-semibold text-text-primary">
                          {row.customer.name ?? 'Customer'}
                          <span className="font-normal text-text-secondary"> · regular at </span>
                          <Link
                            href={`/vendors/${row.vendorId}/edit`}
                            className="underline-offset-2 hover:underline"
                          >
                            {row.garageName}
                          </Link>
                        </p>
                        {row.customer.phone && (
                          <PhoneLink phone={row.customer.phone} name={row.customer.name ?? 'the customer'} className="text-[12px]" />
                        )}
                      </div>
                      <p className="text-[12px] text-text-secondary">
                        <span className="font-numeric">{row.completedHere}</span> completed there ·{' '}
                        <span className="font-numeric">{quietLine(row)}</span>
                      </p>
                      <p className="text-[12px] text-text-muted">
                        Last there{' '}
                        <Link
                          href={`/bookings/${row.lastBookingId}`}
                          className="font-numeric text-text-primary underline-offset-2 hover:underline"
                        >
                          #{row.lastBookingRef}
                        </Link>{' '}
                        · <span className="font-numeric">{formatWhen(row.lastServiceAt)}</span>
                      </p>
                    </ScCard>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  )
}
