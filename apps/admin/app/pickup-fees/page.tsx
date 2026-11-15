'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconTruck } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { FilterChip } from '@repo/ui/sc/chip'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { PageHeader } from '@repo/ui/sc/page-header'
import { Reveal } from '@repo/ui/sc/reveal'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import type { PickupFeeCheckItem } from '@repo/core/api/pickup-fee'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { useDecidePickupFee, usePickupFeeChecks } from '@repo/core/api/hooks/use-pickup-fee'
import { cn } from '@repo/core/utils'
import { IssuesTabs } from '@/components/issues-tabs'
import { Meta } from '@/components/meta'
import { AutoGrowTextarea } from '@/components/auto-grow-textarea'
import { formatWhen } from '@/lib/bookings'
import {
  PICKUP_FEE_CHECK_FILTERS,
  PICKUP_FEE_CHECK_LABELS,
  checkColumns,
  detlioSummary,
  feeSummaryLine,
  parsePickupFeeFilter,
  type PickupFeeCheckFilter,
} from '@/lib/pickup-fees'
import { rupeesCell } from '@/components/pickup-fee/fee-box'

const BADGE: Record<string, 'pending' | 'success' | 'muted'> = {
  waiting: 'pending',
  approved: 'success',
  kept: 'muted',
}

const EMPTY: Record<PickupFeeCheckFilter, { title: string; subtitle: string }> = {
  waiting: {
    title: 'No fees to check',
    subtitle: 'A garage that sets a fee above Detlio’s suggestion shows up here. Customers see Detlio’s fee until you approve.',
  },
  approved: { title: 'Nothing approved yet', subtitle: 'Fees the team approved show up here.' },
  kept: { title: 'No fees kept at Detlio’s', subtitle: 'Fees where the team kept Detlio’s fee show up here, with the reason.' },
}

function CheckCard({ item, suggested }: { item: PickupFeeCheckItem; suggested: Parameters<typeof detlioSummary>[0] }) {
  const decide = useDecidePickupFee()
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState(false)
  const { kms, detlio, garage } = checkColumns(item.after, suggested)
  const answer = (decision: 'approved' | 'kept') => {
    if (decision === 'kept' && !reason.trim()) {
      setReasonError(true)
      return
    }
    setReasonError(false)
    decide.mutate(
      { changeId: item.id, decision, reason: decision === 'kept' ? reason.trim() : undefined },
      {
        onSuccess: () => toast.success(decision === 'approved' ? `Approved ${item.garage.name}’s fee` : 'Kept Detlio’s fee'),
        onError: (error) => toast.error(errorMessage(error, 'Couldn’t save that. Try again.')),
      }
    )
  }
  return (
    <ScCard className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Link
            href={`/vendors/${item.garage.id}/edit?tab=location`}
            className="truncate text-[14px] font-semibold text-text-primary underline-offset-2 hover:underline"
          >
            {item.garage.name}
          </Link>
          <ScBadge variant={BADGE[item.status] ?? 'muted'}>{PICKUP_FEE_CHECK_LABELS[item.status as PickupFeeCheckFilter]}</ScBadge>
        </div>
        <p className="font-numeric text-[12px] text-text-secondary">{formatWhen(item.createdAt)}</p>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
        <Meta label="Their fee">{feeSummaryLine(item.after, suggested)}</Meta>
        <Meta label="Detlio’s suggestion">{detlioSummary(suggested)}</Meta>
        <Meta label="Asked by">
          {item.askedBy.role === 'owner' ? 'Owner' : item.byName}
          {item.askedBy.phone && <span className="font-numeric"> · {item.askedBy.phone}</span>}
        </Meta>
        <Meta label="Pickups, last 30 days">
          <span className="font-numeric">{item.pickupsLast30Days}</span>
        </Meta>
      </div>

      <div className="overflow-x-auto rounded-[12px] border border-border px-3 py-2">
        <table className="w-full min-w-[420px] text-[13px]">
          <caption className="sr-only">{item.garage.name}’s fee next to Detlio’s</caption>
          <thead>
            <tr className="text-[12px] text-text-muted">
              <th scope="col" className="py-1.5 text-left font-normal">
                Road km
              </th>
              {kms.map((km) => (
                <th key={km} scope="col" className="py-1.5 text-right font-normal">
                  <span className="font-numeric">{km}</span> km
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border">
              <th scope="row" className="py-1.5 text-left font-normal text-text-secondary">
                Detlio
              </th>
              {detlio.map((fee, i) => (
                <td key={kms[i]} className="py-1.5 text-right font-numeric text-text-primary">
                  {rupeesCell(fee)}
                </td>
              ))}
            </tr>
            <tr className="border-t border-border">
              <th scope="row" className="py-1.5 text-left font-normal text-text-secondary">
                Garage
              </th>
              {garage.map((fee, i) => (
                <td
                  key={kms[i]}
                  className={cn('py-1.5 text-right font-numeric font-semibold', fee > detlio[i]! ? 'text-tone-attention-text' : 'text-text-primary')}
                >
                  {rupeesCell(fee)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {item.status === 'waiting' ? (
        <div className="flex flex-col gap-2 md:flex-row md:items-start">
          <div className="flex gap-2">
            <ScButton
              onClick={() => answer('approved')}
              disabled={decide.isPending}
              fullWidth={false}
              className="min-h-11 px-5 text-[13px]"
            >
              Approve
            </ScButton>
            <ScButton
              variant="secondary"
              onClick={() => answer('kept')}
              disabled={decide.isPending}
              fullWidth={false}
              className="min-h-11 px-4 text-[13px]"
            >
              Keep Detlio’s fee
            </ScButton>
          </div>
          <div className="min-w-0 flex-1">
            <AutoGrowTextarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              aria-label="Reason, sent to the garage"
              aria-invalid={reasonError ? true : undefined}
              placeholder="Reason, sent to the garage (needed for Keep Detlio’s fee)"
              className={cn(
                'min-h-11 w-full rounded-[12px] border bg-surface px-3.5 py-2.5 text-[14px] text-text-primary outline-none placeholder:text-text-muted focus:border-text-secondary',
                reasonError ? 'border-error' : 'border-border'
              )}
            />
            {reasonError && (
              <p role="alert" className="mt-1.5 text-[12.5px] text-error">
                Write the reason the garage will see.
              </p>
            )}
          </div>
        </div>
      ) : (
        item.decidedAt && (
          <p className="text-[12px] text-text-muted">
            {PICKUP_FEE_CHECK_LABELS[item.status as PickupFeeCheckFilter]} ·{' '}
            <span className="font-numeric">{formatWhen(item.decidedAt)}</span> by {item.decidedBy}
            {item.reason ? ` · “${item.reason}”` : ''}
          </p>
        )
      )}
    </ScCard>
  )
}

function PickupFeeChecksList() {
  const router = useRouter()
  const params = useSearchParams()
  const show = parsePickupFeeFilter(params.get('show'))
  const { data, isPending, isPlaceholderData, error, refetch } = usePickupFeeChecks(show)

  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  const items = data?.items ?? []
  return (
    <>
      <IssuesTabs />
      <PageHeader
        title="Pickup fees to check"
        subtitle="Garages asking for more than Detlio’s suggestion. Customers see Detlio’s fee until you approve."
      />
      <div
        role="group"
        aria-label="Show"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {PICKUP_FEE_CHECK_FILTERS.map((filter) => (
          <FilterChip
            key={filter}
            label={PICKUP_FEE_CHECK_LABELS[filter]}
            count={data?.counts[filter]}
            active={show === filter}
            onClick={() => router.replace(filter === 'waiting' ? '/pickup-fees' : `/pickup-fees?show=${filter}`, { scroll: false })}
            className="min-h-11 rounded-[10px] text-[13px]"
          />
        ))}
      </div>
      {isPending ? (
        <SkeletonList count={2} itemClassName="h-56" />
      ) : error && items.length === 0 ? (
        <ErrorState message={errorMessage(error, 'Failed to load pickup fees')} onRetry={() => void refetch()} />
      ) : items.length === 0 || !data ? (
        <EmptyState icon={<IconTruck size={32} stroke={1.5} />} title={EMPTY[show].title} subtitle={EMPTY[show].subtitle} />
      ) : (
        <ul
          className={cn('flex flex-col gap-2 transition-opacity', isPlaceholderData && 'opacity-50')}
          aria-busy={isPlaceholderData}
          aria-label={`${PICKUP_FEE_CHECK_LABELS[show]} pickup fees`}
        >
          {items.map((item, i) => (
            <Reveal as="li" key={item.id} index={i}>
              <CheckCard item={item} suggested={data.suggested} />
            </Reveal>
          ))}
        </ul>
      )}
    </>
  )
}

/** Issues → Pickup fees (0079, admin mockup 4). */
export default function AdminPickupFeesPage() {
  // useSearchParams needs a Suspense boundary, or Next.js refuses to prerender the page.
  return (
    <Suspense fallback={<SkeletonList count={2} itemClassName="h-56" />}>
      <PickupFeeChecksList />
    </Suspense>
  )
}
