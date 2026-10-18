'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconGift } from '@tabler/icons-react'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { FilterChip } from '@repo/ui/sc/chip'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { PageHeader } from '@repo/ui/sc/page-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { StatTile } from '@repo/ui/sc/stat-tile'
import type { AdminGift, AdminGiftsSummary } from '@repo/core/api/gifts'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import {
  useAdminGifts,
  useAdminGiftsConfig,
  useAdminGiftsSummary,
} from '@repo/core/api/hooks/use-admin-gifts'
import { CopyButton } from '@/components/copy-button'
import { Meta } from '@/components/meta'
import { CancelGiftDialog } from '@/components/gifts/cancel-gift-dialog'
import { CustomerCreditSection } from '@/components/gifts/customer-credit-section'
import { formatRupees } from '@/lib/bookings'
import {
  GIFT_FILTERS,
  GIFT_FILTER_LABELS,
  GIFT_STATE_BADGES,
  GIFT_STATE_LABELS,
  canCancelGift,
  formatDay,
  giftsListHref,
  parseGiftFilter,
} from '@/lib/gifts'

/** "3 · ₹2,500": a count and its money, the count first. */
function countAndAmount(count: number, amount: string) {
  return (
    <>
      {count} · {formatRupees(amount)}
    </>
  )
}

function SummaryTiles({ summary }: { summary: AdminGiftsSummary }) {
  const credit = summary.credit
  return (
    <div className="flex flex-col gap-3">
      {/* The headline: what Detlio would have to honour if every gift and
          every credit balance were used today. */}
      <ScCard className="flex flex-col gap-1 px-4 py-4">
        <p className="text-[12px] font-medium text-text-secondary">Outstanding liability</p>
        <p className="font-numeric text-[32px] font-bold leading-none tracking-tight text-text-primary">
          {formatRupees(summary.liability)}
        </p>
        <p className="text-[12px] text-text-secondary">
          What Detlio still owes in gifts and credit: gifts not yet redeemed (
          <span className="font-numeric">{formatRupees(summary.unredeemed.amount)}</span>) plus customers&apos; credit
          balances (<span className="font-numeric">{formatRupees(credit.balance)}</span>).
        </p>
      </ScCard>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Sold" value={formatRupees(summary.sold.amount)} hint={`${summary.sold.count} gifts`} />
        <StatTile
          label="Redeemed"
          value={formatRupees(summary.redeemed.amount)}
          hint={`${summary.redeemed.count} gifts`}
        />
        <StatTile
          label="Not yet redeemed"
          value={formatRupees(summary.unredeemed.amount)}
          hint={`${summary.unredeemed.count} gifts`}
        />
        <StatTile
          label={`Expiring in ${summary.expiringSoon.days} days`}
          value={formatRupees(Number(summary.expiringSoon.gifts.amount) + Number(summary.expiringSoon.credit))}
          hint={
            <>
              {summary.expiringSoon.gifts.count} gifts ({formatRupees(summary.expiringSoon.gifts.amount)}) + credit{' '}
              {formatRupees(summary.expiringSoon.credit)}
            </>
          }
          tone={Number(summary.expiringSoon.gifts.amount) + Number(summary.expiringSoon.credit) > 0 ? 'warning' : 'default'}
        />
        <StatTile
          label="Credit balances"
          value={formatRupees(credit.balance)}
          hint={`${credit.customers} ${credit.customers === 1 ? 'customer' : 'customers'}`}
        />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-6">
        <Meta label="Credit spent on bookings">
          <span className="font-numeric">{formatRupees(credit.spent)}</span>
        </Meta>
        <Meta label="Credit given back">
          <span className="font-numeric">{formatRupees(credit.returned)}</span>
        </Meta>
        <Meta label="Credit expired">
          <span className="font-numeric">{formatRupees(credit.expired)}</span>
        </Meta>
        <Meta label="Credit adjusted">
          <span className="font-numeric">{formatRupees(credit.adjusted)}</span>
        </Meta>
        {/* Bypass report rewards (0052): Detlio's own money, not gift sales. */}
        {credit.rewarded !== undefined && (
          <Meta label="Report rewards">
            <span className="font-numeric">{formatRupees(credit.rewarded)}</span>
          </Meta>
        )}
        <Meta label="Gifts expired">
          <span className="font-numeric">{countAndAmount(summary.expired.count, summary.expired.amount)}</span>
        </Meta>
        <Meta label="Gifts cancelled">
          <span className="font-numeric">{countAndAmount(summary.cancelled.count, summary.cancelled.amount)}</span>
        </Meta>
      </div>
    </div>
  )
}

function GiftRow({ gift, onCancel }: { gift: AdminGift; onCancel: (gift: AdminGift) => void }) {
  return (
    <ScCard className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-numeric text-[13px] font-semibold text-text-primary">{gift.number}</span>
          <span className="font-numeric text-[15px] font-bold text-text-primary">{formatRupees(gift.amount)}</span>
          <ScBadge variant={GIFT_STATE_BADGES[gift.state]}>{GIFT_STATE_LABELS[gift.state]}</ScBadge>
          {gift.gatewayMode === 'test' && <ScBadge variant="muted">Test</ScBadge>}
          {gift.gatewayMode === 'fake' && <ScBadge variant="muted">Fake</ScBadge>}
        </div>
        {canCancelGift(gift.state) && (
          <ScButton
            variant="secondary"
            fullWidth={false}
            className="min-h-11 px-3 text-[12px]"
            onClick={() => onCancel(gift)}
          >
            Cancel gift
          </ScButton>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
        <Meta label="Buyer" truncate>
          {gift.buyer.name} <span className="font-numeric text-text-muted">{gift.buyer.phone}</span>
        </Meta>
        <Meta label="For" truncate>
          {gift.recipientName}
        </Meta>
        <Meta label="Redeemed by" truncate>
          {gift.redeemer ? (gift.redeemer.name ?? 'A customer') : '—'}
          {gift.redeemedAt && <span className="font-numeric text-text-muted"> · {formatDay(gift.redeemedAt)}</span>}
        </Meta>
        <Meta label="Paid">
          <span className="font-numeric">{formatDay(gift.paidAt)}</span>
        </Meta>
        <Meta label="Expires">
          <span className="font-numeric">{formatDay(gift.expiresAt)}</span>
        </Meta>
        <Meta label="Razorpay payment" className="col-span-2 md:col-span-3">
          {gift.paymentId ? (
            <div className="flex min-w-0 items-center">
              <span className="truncate font-numeric">{gift.paymentId}</span>
              <CopyButton
                value={gift.paymentId}
                label={`Copy Razorpay payment id ${gift.paymentId}`}
                className="-my-2 shrink-0"
              />
            </div>
          ) : (
            '—'
          )}
        </Meta>
      </div>

      {gift.state === 'cancelled' && (
        <p className="text-[12px] text-text-secondary">
          Cancelled{gift.cancelledAt ? ` ${formatDay(gift.cancelledAt)}` : ''}
          {gift.cancelledBy ? ` by ${gift.cancelledBy}` : ''}
          {gift.cancelReason ? `: ${gift.cancelReason}` : ''}
        </p>
      )}
    </ScCard>
  )
}

function GiftsScreen() {
  const router = useRouter()
  const params = useSearchParams()
  // The chip lives in the URL, like the other lists.
  const show = parseGiftFilter(params.get('show'))
  const config = useAdminGiftsConfig()
  const on = config.data?.enabled === true
  const summary = useAdminGiftsSummary(on)
  const gifts = useAdminGifts(show, on)
  const [cancelling, setCancelling] = useState<AdminGift | null>(null)

  // A dead admin session is a redirect, not an error message.
  const authError = [config.error, summary.error, gifts.error].find(isAuthError)
  useEffect(() => {
    if (authError) router.replace('/login')
  }, [authError, router])

  const header = (
    <PageHeader
      title="Gifts"
      subtitle="Detlio gifts sold and redeemed, customers' credit, and what is still owed."
    />
  )

  if (config.isPending) {
    return (
      <>
        {header}
        <SkeletonList count={2} itemClassName="h-32" />
      </>
    )
  }

  // Off at the API (GIFTS_ENABLED): nothing to show, and nothing links here.
  if (!on) {
    return (
      <>
        {header}
        <EmptyState
          icon={<IconGift size={32} stroke={1.5} />}
          title="Gifts are switched off"
          subtitle="Gift a wash is off on the API (GIFTS_ENABLED). Nothing about it shows to customers."
        />
      </>
    )
  }

  const list = gifts.data ?? []

  return (
    <>
      {header}

      {summary.isPending ? (
        <SkeletonList count={1} itemClassName="h-40" />
      ) : summary.isError || !summary.data ? (
        <ErrorState
          message={errorMessage(summary.error, "Couldn't load the gift totals.")}
          onRetry={() => void summary.refetch()}
        />
      ) : (
        <SummaryTiles summary={summary.data} />
      )}

      <section aria-labelledby="gifts-list" className="flex flex-col gap-3">
        <h2 id="gifts-list" className="text-[15px] font-semibold text-text-primary">
          Gifts
        </h2>
        <div
          role="group"
          aria-label="Show"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {GIFT_FILTERS.map((filter) => (
            <FilterChip
              key={filter}
              label={GIFT_FILTER_LABELS[filter]}
              active={show === filter}
              onClick={() => router.replace(giftsListHref(filter), { scroll: false })}
              className="min-h-11 rounded-[10px] text-[13px]"
            />
          ))}
        </div>

        {gifts.isPending ? (
          <SkeletonList count={2} itemClassName="h-32" />
        ) : gifts.isError && list.length === 0 ? (
          <ErrorState message={errorMessage(gifts.error, "Couldn't load gifts.")} onRetry={() => void gifts.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<IconGift size={32} stroke={1.5} />}
            title={show === 'all' ? 'No gifts yet' : `No ${GIFT_FILTER_LABELS[show].toLowerCase()} gifts`}
          />
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Gifts, newest first">
            {list.map((gift) => (
              <li key={gift.id}>
                <GiftRow gift={gift} onCancel={setCancelling} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <CustomerCreditSection />

      {cancelling && (
        <CancelGiftDialog key={cancelling.id} gift={cancelling} onClose={() => setCancelling(null)} />
      )}
    </>
  )
}

/**
 * Admin → Gifts (0049): the totals with the outstanding liability first,
 * every gift with its buyer, redeemer and Razorpay payment (Cancel gift for
 * one being refunded by hand), and Customer credit (find by phone, top
 * balances, adjust). Shown only while Gift a wash is on at the API.
 */
export default function AdminGiftsPage() {
  // useSearchParams needs a Suspense boundary, or Next.js refuses to
  // prerender the page.
  return (
    <Suspense fallback={<SkeletonList count={2} itemClassName="h-32" />}>
      <GiftsScreen />
    </Suspense>
  )
}
