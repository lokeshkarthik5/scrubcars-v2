'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  IconDiscount2,
  IconPencil,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { ScCard } from '@repo/ui/sc/card'
import { FilterChip } from '@repo/ui/sc/chip'
import { ScInput } from '@repo/ui/sc/input'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { PageHeader } from '@repo/ui/sc/page-header'
import { Reveal } from '@repo/ui/sc/reveal'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import {
  errorMessage,
  isAuthError,
  useAdminDiscounts,
  useDeleteDiscount,
  useToggleDiscountActive,
} from '@repo/core/api/hooks/use-discounts'
import type { AdminDiscount } from '@repo/core/api/admin'
import { Meta } from '@/components/meta'

const rupees = (value: string | number) =>
  `₹${Number(value).toLocaleString('en-IN')}`

/** "20% off, max ₹300" / "₹200 off" — the effect in one line. */
function effectLabel(discount: AdminDiscount): string {
  if (discount.discountType === 'percentage') {
    const percent = `${Number(discount.percentOff)}% off`
    return discount.maxDiscountAmount
      ? `${percent}, max ${rupees(discount.maxDiscountAmount)}`
      : percent
  }
  return `${rupees(discount.amountOff ?? 0)} off`
}

/** "min ₹999 · once per customer · Sparkle Motors only" */
function conditionLabel(discount: AdminDiscount): string {
  const parts: string[] = []

  if (discount.minOrderAmount) {
    parts.push(`min ${rupees(discount.minOrderAmount)}`)
  }
  if (discount.perUserLimit === 1) {
    parts.push('once per customer')
  } else if (discount.perUserLimit) {
    parts.push(`${discount.perUserLimit}× per customer`)
  }
  if (discount.totalUsageLimit) {
    parts.push(`${discount.totalUsageLimit} total`)
  }
  if (discount.vendorName) {
    parts.push(`${discount.vendorName} only`)
  }

  return parts.length > 0 ? parts.join(' · ') : 'No conditions'
}

const STAGES = ['all', 'active', 'scheduled', 'expired', 'inactive'] as const
type Stage = (typeof STAGES)[number]

/**
 * The lifecycle stage, which is not the same as `isActive`: a code can be
 * switched on and still be scheduled or expired. This is why the list filters
 * client-side rather than through the API's `?active=` — that flag cannot
 * express "scheduled" or "expired", both of which are derived from the window.
 */
function stageBadge(discount: AdminDiscount) {
  if (!discount.isActive) {
    return { stage: 'inactive' as const, label: 'Inactive', variant: 'muted' as const }
  }

  const now = Date.now()

  if (discount.startsAt && now < Date.parse(discount.startsAt)) {
    return { stage: 'scheduled' as const, label: 'Scheduled', variant: 'pending' as const }
  }
  if (discount.endsAt && now > Date.parse(discount.endsAt)) {
    return { stage: 'expired' as const, label: 'Expired', variant: 'muted' as const }
  }
  return { stage: 'active' as const, label: 'Active', variant: 'success' as const }
}

// The small actions on a code's card: outline, 44px tall, never red.
const ROW_ACTION = 'flex min-h-11 items-center gap-1 px-3 py-1.5 text-[12px]'

export default function AdminDiscountsPage() {
  const router = useRouter()

  const { data: discounts = [], isPending, error, refetch } = useAdminDiscounts()

  const [search, setSearch] = useState('')
  const [stage, setStage] = useState<Stage>('all')

  // Filtered in memory: the list is a single unpaginated fetch, so this is
  // instant and needs no debounce. The API's q/active params stay available
  // for when this list grows enough to paginate.
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return discounts.filter((discount) => {
      if (stage !== 'all' && stageBadge(discount).stage !== stage) return false
      if (!query) return true
      return (
        discount.code.toLowerCase().includes(query) ||
        (discount.description ?? '').toLowerCase().includes(query)
      )
    })
  }, [discounts, search, stage])

  const isFiltered = search.trim().length > 0 || stage !== 'all'

  // Row-action failures show above the list rather than replacing it — the
  // data is still good, only the action failed.
  const [actionError, setActionError] = useState('')

  const toggleActive = useToggleDiscountActive({
    onError: (err) => setActionError(errorMessage(err, 'Failed to update the code')),
  })
  const deleteDiscount = useDeleteDiscount()

  // A dead admin session is a redirect, not an error message.
  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  const busyId = toggleActive.isPending
    ? toggleActive.variables?.id
    : deleteDiscount.isPending
      ? deleteDiscount.variables
      : null

  const handleDelete = (discount: AdminDiscount) => {
    if (
      !window.confirm(
        `Permanently delete "${discount.code}"?\n\nOnly codes that have never been used can be deleted. Deactivate instead if you just want to stop it.`
      )
    ) {
      return
    }
    setActionError('')
    deleteDiscount.mutate(discount.id, {
      // The API refuses to delete a redeemed code; show its reason verbatim.
      onError: (err) =>
        setActionError(errorMessage(err, 'Failed to delete the code')),
    })
  }

  return (
    <>
      <PageHeader
        title="Discounts"
        subtitle={
          !isPending && !error && discounts.length > 0 ? (
            isFiltered ? (
              <>
                <span className="font-numeric">{visible.length}</span> of{' '}
                <span className="font-numeric">{discounts.length}</span>
              </>
            ) : (
              <>
                <span className="font-numeric">{discounts.length}</span> total
              </>
            )
          ) : undefined
        }
        // The page's one red: adding a code is what it is for.
        actions={
          <ScButtonLink href="/discounts/new">
            <IconPlus size={16} aria-hidden="true" /> Add discount
          </ScButtonLink>
        }
      />

      {!isPending && !error && discounts.length > 0 && (
        <>
          <ScInput
            id="discount-search"
            type="search"
            aria-label="Search discounts"
            placeholder="Search code or note"
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-11"
          />

          <div role="group" aria-label="Status" className="flex flex-wrap gap-1.5">
            {STAGES.map((option) => (
              <FilterChip
                key={option}
                label={option === 'all' ? 'All' : option[0].toUpperCase() + option.slice(1)}
                active={stage === option}
                onClick={() => setStage(option)}
              />
            ))}
          </div>
        </>
      )}

      {isPending ? (
        <SkeletonList count={3} itemClassName="h-40" />
      ) : error ? (
        <ErrorState
          message={errorMessage(error, 'Failed to load discounts')}
          onRetry={() => void refetch()}
        />
      ) : discounts.length === 0 ? (
        <EmptyState
          icon={<IconDiscount2 size={32} stroke={1.5} />}
          title="No discounts yet"
          subtitle="Create a promo code customers can apply at checkout."
          actionLabel="Add discount"
          onAction={() => router.push('/discounts/new')}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<IconDiscount2 size={32} stroke={1.5} />}
          title="No matching codes"
          subtitle="Try a different search or status filter."
          actionLabel="Clear filters"
          onAction={() => {
            setSearch('')
            setStage('all')
          }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {/* Amber, as errors are: red is the Add discount button's. */}
          {actionError && (
            <p role="alert" className="text-[12px] text-error">{actionError}</p>
          )}

          {visible.map((discount, i) => {
            // Named `badge`, not `stage`: the outer `stage` is the active filter.
            const badge = stageBadge(discount)
            return (
              <Reveal key={discount.id} index={i}>
                <ScCard className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                    <div className="min-w-0">
                      {/* A code is read out and typed in, like a booking
                          reference, so it is set as references are. */}
                      <p className="truncate font-numeric text-[14px] font-bold tracking-wide text-text-primary">
                        {discount.code}
                      </p>
                      <p className="truncate text-[11px] text-text-secondary">
                        {discount.description || effectLabel(discount)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <ScBadge variant={badge.variant}>{badge.label}</ScBadge>
                      {/* Neutral both ways: who pays is a fact, not an alert,
                          and the red accent badge is kept for a new job. */}
                      <ScBadge
                        variant={
                          discount.fundedBy === 'platform' ? 'pending' : 'muted'
                        }
                      >
                        {discount.fundedBy === 'platform' ? 'Detlio pays' : 'Garage pays'}
                      </ScBadge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                    <Meta label="Effect" truncate>{effectLabel(discount)}</Meta>
                    <Meta label="Conditions" truncate>{conditionLabel(discount)}</Meta>
                    <Meta label="Used" truncate>
                      {discount.heldCount > 0 ? (
                        <>
                          {/* Held, not realized: this is the number the usage
                              limit is checked against, so it must be the one an
                              admin sees next to that limit. */}
                          <span className="font-numeric">
                            {discount.heldCount}
                            {discount.totalUsageLimit
                              ? ` / ${discount.totalUsageLimit}`
                              : ''}
                          </span>
                          <span className="text-text-muted">
                            {' '}
                            · <span className="font-numeric">{rupees(discount.totalSaved)}</span> saved
                          </span>
                        </>
                      ) : (
                        <span className="text-text-muted">Never</span>
                      )}
                    </Meta>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <ScButton
                      fullWidth={false}
                      variant="secondary"
                      disabled={busyId === discount.id}
                      onClick={() => {
                        setActionError('')
                        toggleActive.mutate({
                          id: discount.id,
                          isActive: !discount.isActive,
                        })
                      }}
                      className={ROW_ACTION}
                    >
                      {discount.isActive ? 'Deactivate' : 'Activate'}
                    </ScButton>
                    <ScButtonLink
                      href={`/discounts/${discount.id}/edit`}
                      variant="secondary"
                      aria-label={`Edit ${discount.code}`}
                      className={ROW_ACTION}
                    >
                      <IconPencil size={14} aria-hidden="true" /> Edit
                    </ScButtonLink>
                    {/* Mirrors the API: a redeemed code can only be deactivated. */}
                    {discount.redemptionCount === 0 && (
                      <button
                        type="button"
                        disabled={busyId === discount.id}
                        onClick={() => handleDelete(discount)}
                        title="Delete permanently"
                        aria-label={`Delete ${discount.code}`}
                        // Grey until hovered, then amber: it asks first, and red
                        // is the Add discount button's.
                        className="ml-auto inline-flex size-11 items-center justify-center rounded-[10px] text-text-muted transition-colors hover:bg-error-muted hover:text-error disabled:opacity-50"
                      >
                        <IconTrash size={16} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </ScCard>
              </Reveal>
            )
          })}
        </div>
      )}
    </>
  )
}
