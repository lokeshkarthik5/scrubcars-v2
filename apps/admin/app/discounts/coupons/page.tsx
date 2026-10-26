'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconPlus, IconTicket } from '@tabler/icons-react'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { ScCard } from '@repo/ui/sc/card'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { PageHeader } from '@repo/ui/sc/page-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import type { AdminCouponBatch } from '@repo/core/api/coupons'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { useCouponBatches } from '@repo/core/api/hooks/use-admin-coupons'
import { DiscountsTabs } from '@/components/discounts-tabs'
import { Meta } from '@/components/meta'
import { formatRupees, todayIst } from '@/lib/bookings'
import {
  STAGE_BADGES,
  STAGE_LABELS,
  batchStage,
  byLocation,
  printedLabel,
  rate,
  scannedFigure,
} from '@/lib/coupons'

function BatchRow({
  batch,
  today,
}: {
  batch: AdminCouponBatch
  today: string
}) {
  const stage = batchStage(batch, today)
  const f = batch.figures
  return (
    <Link href={`/discounts/coupons/${batch.id}`} className="block">
      <ScCard className="flex flex-col gap-3 transition-colors hover:border-white/20">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-text-primary">
              {batch.name}
            </p>
            <p className="truncate text-[12px] text-text-secondary">
              {batch.location} · {batch.title}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <ScBadge variant={STAGE_BADGES[stage]}>
              {STAGE_LABELS[stage]}
            </ScBadge>
            <ScBadge variant="muted">
              {batch.kind === 'unique' ? 'Unique codes' : 'Shared code'}
            </ScBadge>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-6">
          <Meta label="Printed">
            <span className="font-numeric">{printedLabel(batch)}</span>
          </Meta>
          <Meta label="Scanned">
            <span className="font-numeric">
              {scannedFigure(batch).toLocaleString('en-IN')}
            </span>
          </Meta>
          <Meta label="Added">
            <span className="font-numeric">
              {f.redeemed.toLocaleString('en-IN')}
              {batch.kind === 'unique' && (
                <span className="text-text-muted">
                  {' '}
                  · {rate(f.redeemed, batch.codeCount)}
                </span>
              )}
            </span>
          </Meta>
          <Meta label="Bookings">
            <span className="font-numeric">
              {f.bookings.toLocaleString('en-IN')}
            </span>
          </Meta>
          <Meta label="New customers">
            <span className="font-numeric">
              {f.newCustomers.toLocaleString('en-IN')}
            </span>
          </Meta>
          <Meta label="Cost so far">
            <span className="font-numeric">
              {formatRupees(f.cost)}
              {f.stampsGiven > 0 && ` + ${f.stampsGiven} stamps`}
            </span>
          </Meta>
        </div>
      </ScCard>
    </Link>
  )
}

/**
 * Discounts → Coupons (0056): every printed batch with what came of it
 * (printed, scanned, added, bookings, new customers, cost), and the same
 * figures added up by where each was given out, so the team can see which
 * giveaway works best.
 */
export default function CouponBatchesPage() {
  const router = useRouter()
  const batches = useCouponBatches()
  const today = todayIst()

  useEffect(() => {
    if (isAuthError(batches.error)) router.replace('/login')
  }, [batches.error, router])

  const list = batches.data ?? []
  const locations = byLocation(list)

  return (
    <>
      <PageHeader
        title="Offers"
        subtitle="Printed coupons with QR codes: each customer who scans one gets a one-use coupon in the app. Detlio pays for them."
        actions={
          <ScButtonLink href="/discounts/coupons/new">
            <IconPlus size={16} aria-hidden="true" /> New batch
          </ScButtonLink>
        }
      />
      <DiscountsTabs />

      {batches.isPending ? (
        <SkeletonList count={3} itemClassName="h-32" />
      ) : batches.isError ? (
        <ErrorState
          message={errorMessage(batches.error, "Couldn't load coupon batches.")}
          onRetry={() => void batches.refetch()}
        />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<IconTicket size={32} stroke={1.5} />}
          title="No coupon batches yet"
          subtitle="Make a batch, print its sheet and hand the coupons out: flyers, cards at an event, a poster at a garage counter."
          actionLabel="New batch"
          onAction={() => router.push('/discounts/coupons/new')}
        />
      ) : (
        <>
          {locations.length > 1 && (
            <section
              aria-labelledby="by-location"
              className="flex flex-col gap-2"
            >
              <h2
                id="by-location"
                className="text-[15px] font-semibold text-text-primary"
              >
                By where they were given out
              </h2>
              <ScCard className="overflow-x-auto p-0">
                <table className="w-full min-w-[560px] text-left text-[12px]">
                  <thead className="text-[12px] text-text-secondary">
                    <tr>
                      <th className="px-4 py-2 font-medium">Where</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Printed
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Added
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Bookings
                      </th>
                      <th className="px-3 py-2 text-right font-medium">New</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Revenue
                      </th>
                      <th className="px-4 py-2 text-right font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="font-numeric text-text-secondary">
                    {locations.map((row) => (
                      <tr key={row.location} className="border-t border-border">
                        <td className="px-4 py-2 font-sans text-text-primary">
                          {row.location}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.printed.toLocaleString('en-IN')}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.redeemed.toLocaleString('en-IN')}{' '}
                          <span className="text-text-muted">
                            {rate(row.redeemed, row.printed)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.bookings.toLocaleString('en-IN')}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.newCustomers.toLocaleString('en-IN')}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {formatRupees(row.revenue)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {formatRupees(row.cost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScCard>
            </section>
          )}

          <section aria-labelledby="batches" className="flex flex-col gap-2">
            <h2
              id="batches"
              className="text-[15px] font-semibold text-text-primary"
            >
              Batches
            </h2>
            <ul className="flex flex-col gap-2">
              {list.map((batch) => (
                <li key={batch.id}>
                  <BatchRow batch={batch} today={today} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  )
}
