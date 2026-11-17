'use client'

import { Suspense, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconSparkles } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { FilterChip } from '@repo/ui/sc/chip'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { PageHeader } from '@repo/ui/sc/page-header'
import { Reveal } from '@repo/ui/sc/reveal'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import type { ShineCheck, ShineCheckStatus } from '@repo/core/api/shine-score'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { shineOn, useReviewShineCheck, useShineChecks, useShineConfig } from '@repo/core/api/hooks/use-shine-score'
import { cn } from '@repo/core/utils'
import { IssuesTabs } from '@/components/issues-tabs'
import { Meta } from '@/components/meta'
import { PhoneLink } from '@/components/phone-link'
import { formatWhen } from '@/lib/bookings'
import {
  SHINE_CHECK_FILTERS,
  SHINE_CHECK_LABELS,
  parseShineFilter,
  shineFilterHint,
  shineListHref,
} from '@/lib/shine-checks'

const STATUS_BADGE: Record<ShineCheckStatus, 'pending' | 'success' | 'muted'> = {
  new: 'pending',
  looks_fine: 'muted',
  followed_up: 'success',
}

const EMPTY: Record<ShineCheckStatus, { title: string; subtitle: string }> = {
  new: {
    title: 'No low after-scores',
    subtitle: 'A finished booking whose after-photos score under the line shows up here for someone to look at.',
  },
  looks_fine: { title: 'Nothing marked fine yet', subtitle: 'Checks the team looked at and found fine show up here.' },
  followed_up: { title: 'Nothing followed up yet', subtitle: 'Checks the team followed up show up here.' },
}

function CheckCard({ check: c }: { check: ShineCheck }) {
  const review = useReviewShineCheck()
  const mark = (outcome: 'looks_fine' | 'followed_up') =>
    review.mutate(
      { id: c.id, outcome },
      {
        onSuccess: () => toast.success(outcome === 'looks_fine' ? 'Marked as looks fine' : 'Marked as followed up'),
        onError: (error) => toast.error(errorMessage(error, 'Could not mark it. Try again.')),
      }
    )
  return (
    <ScCard className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {c.garage.id ? (
            <Link
              href={`/vendors/${c.garage.id}/edit`}
              className="truncate text-[14px] font-semibold text-text-primary underline-offset-2 hover:underline"
            >
              {c.garage.name}
            </Link>
          ) : (
            <span className="truncate text-[14px] font-semibold text-text-primary">{c.garage.name}</span>
          )}
          <ScBadge variant={STATUS_BADGE[c.status]}>{SHINE_CHECK_LABELS[c.status]}</ScBadge>
          {c.booking.markedTest && <ScBadge variant="muted">Test</ScBadge>}
        </div>
        <p className="font-numeric text-[12px] text-text-secondary">{formatWhen(c.scoredAt)}</p>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
        <Meta label="After score">
          <span className="font-numeric font-semibold text-text-primary">{c.afterScore}</span>{' '}
          <span className="font-numeric text-text-secondary">(before {c.beforeScore})</span>
        </Meta>
        <Meta label="Lowest area">{c.lowestArea ?? '—'}</Meta>
        <Meta label="Booking">
          <Link
            href={`/bookings/${c.booking.id}`}
            className="font-numeric text-text-primary underline-offset-2 hover:underline"
          >
            #{c.booking.reference}
          </Link>
          <span className="block font-numeric text-[12px] text-text-muted">{formatWhen(c.booking.scheduledAt)}</span>
        </Meta>
        <Meta label="Customer" truncate>
          {c.customer ? (
            <>
              {c.customer.name ?? '—'}
              {c.customer.phone && (
                <span className="block">
                  <PhoneLink phone={c.customer.phone} name={c.customer.name ?? 'the customer'} />
                </span>
              )}
            </>
          ) : (
            'Account deleted'
          )}
        </Meta>
      </div>

      {(c.photos.length > 0 || c.findings.length > 0) && (
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:gap-6">
          {c.photos.length > 0 && (
            <ul className="flex gap-2" aria-label="After photos">
              {c.photos.map((photo, i) => (
                <li key={photo.id}>
                  <a
                    href={photo.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open after photo ${i + 1}`}
                    className="block h-16 w-24 overflow-hidden rounded-[8px] bg-surface ring-1 ring-inset ring-border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt="" className="size-full object-cover" />
                  </a>
                </li>
              ))}
            </ul>
          )}
          {c.findings.length > 0 && (
            <p className="text-[12px] text-text-primary">
              <span className="text-text-muted">Detlio noticed: </span>
              {c.findings.map((f) => f.charAt(0).toLowerCase() + f.slice(1)).join(', ')}.
            </p>
          )}
        </div>
      )}

      {c.status === 'new' ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <ScButton
            onClick={() => mark('followed_up')}
            disabled={review.isPending}
            fullWidth={false}
            className="min-h-11 px-4 text-[13px]"
          >
            Follow up
          </ScButton>
          <ScButton
            variant="secondary"
            onClick={() => mark('looks_fine')}
            disabled={review.isPending}
            fullWidth={false}
            className="min-h-11 px-4 text-[13px]"
          >
            Looks fine
          </ScButton>
        </div>
      ) : (
        c.reviewedAt && (
          <p className="text-[12px] text-text-muted">
            {SHINE_CHECK_LABELS[c.status]} · <span className="font-numeric">{formatWhen(c.reviewedAt)}</span> by{' '}
            {c.reviewedBy}
          </p>
        )
      )}
    </ScCard>
  )
}

function ShineChecksList() {
  const router = useRouter()
  const params = useSearchParams()
  const show = parseShineFilter(params.get('show'))
  const config = useShineConfig()
  const on = shineOn(config.data)
  const { data, isPending, isPlaceholderData, error, refetch } = useShineChecks(show, on)

  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  const checks = data?.checks ?? []

  if (!config.isPending && !on) {
    return (
      <>
        <IssuesTabs />
        <EmptyState
          icon={<IconSparkles size={32} stroke={1.5} />}
          title="Shine Score is off"
          subtitle="Turn on SHINE_SCORE_ENABLED in the API's environment to score finished jobs."
        />
      </>
    )
  }

  return (
    <>
      <IssuesTabs />
      <PageHeader
        title="Shine checks"
        subtitle="Bookings whose after-photos scored low. A person looks at each one; a score alone never counts against a garage."
      />

      <div>
        <div
          role="group"
          aria-label="Show"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {SHINE_CHECK_FILTERS.map((filter) => (
            <FilterChip
              key={filter}
              label={SHINE_CHECK_LABELS[filter]}
              count={data?.counts[filter]}
              active={show === filter}
              onClick={() => router.replace(shineListHref(filter), { scroll: false })}
              className="min-h-11 rounded-[10px] text-[13px]"
            />
          ))}
        </div>
        <p className="mt-2.5 text-[12px] leading-[1.45] text-text-muted">
          {shineFilterHint(show, data?.rules.lowAfterScore)}
        </p>
      </div>

      {isPending ? (
        <SkeletonList count={3} itemClassName="h-36" />
      ) : error && checks.length === 0 ? (
        <ErrorState message={errorMessage(error, 'Failed to load Shine checks')} onRetry={() => void refetch()} />
      ) : checks.length === 0 ? (
        <EmptyState icon={<IconSparkles size={32} stroke={1.5} />} title={EMPTY[show].title} subtitle={EMPTY[show].subtitle} />
      ) : (
        <ul
          className={cn('flex flex-col gap-2 transition-opacity', isPlaceholderData && 'opacity-50')}
          aria-busy={isPlaceholderData}
          aria-label={`${SHINE_CHECK_LABELS[show]} Shine checks`}
        >
          {checks.map((check, i) => (
            <Reveal as="li" key={check.id} index={i}>
              <CheckCard check={check} />
            </Reveal>
          ))}
        </ul>
      )}
    </>
  )
}

export default function AdminShineChecksPage() {
  // useSearchParams needs a Suspense boundary, or Next.js refuses to prerender the page.
  return (
    <Suspense fallback={<SkeletonList count={3} itemClassName="h-36" />}>
      <ShineChecksList />
    </Suspense>
  )
}
