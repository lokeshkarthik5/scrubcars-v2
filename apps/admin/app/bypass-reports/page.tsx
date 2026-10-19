'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconChevronRight, IconFlag } from '@tabler/icons-react'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { FilterChip } from '@repo/ui/sc/chip'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { PageHeader } from '@repo/ui/sc/page-header'
import { Reveal } from '@repo/ui/sc/reveal'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import type {
  AdminBypassFilter,
  AdminBypassReport,
} from '@repo/core/api/bypass-reports'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { useAdminBypassReports } from '@repo/core/api/hooks/use-bypass-reports'
import {
  BYPASS_REWARD_LABELS,
  BYPASS_STATUS_LABELS,
  strikesLabel,
} from '@repo/core/bypass-reports'
import { cn } from '@repo/core/utils'
import { BypassAnswerDialog } from '@/components/bypass-answer-dialog'
import { Meta } from '@/components/meta'
import { PhoneLink } from '@/components/phone-link'
import { formatWhen } from '@/lib/bookings'
import {
  BYPASS_FILTERS,
  BYPASS_FILTER_LABELS,
  bypassFilterHint,
  bypassListHref,
  parseBypassFilter,
} from '@/lib/bypass-reports'

const STATUS_BADGE: Record<
  AdminBypassReport['status'],
  'pending' | 'success' | 'muted'
> = {
  new: 'pending',
  confirmed: 'success',
  dismissed: 'muted',
}

const EMPTY: Record<AdminBypassFilter, { title: string; subtitle: string }> = {
  new: {
    title: 'No new reports',
    subtitle:
      'Customers report a garage that asked them to book directly or pay outside Detlio from their booking. Each one shows up here and in the team’s Telegram group.',
  },
  confirmed: {
    title: 'Nothing confirmed yet',
    subtitle: 'Confirmed reports, and the strikes they add, show up here.',
  },
  dismissed: {
    title: 'Nothing dismissed',
    subtitle: 'Reports the team looked into and set aside show up here.',
  },
}

function ReportCard({
  report: r,
  onAnswer,
}: {
  report: AdminBypassReport
  onAnswer: (action: 'confirm' | 'dismiss') => void
}) {
  return (
    <ScCard
      className={cn(
        'flex flex-col gap-2.5',
        r.garage.highlighted && 'border-warning/60'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {r.garage.id ? (
            <Link
              href={`/vendors/${r.garage.id}/edit`}
              className="truncate text-[14px] font-semibold text-text-primary underline-offset-2 hover:underline"
            >
              {r.garage.name}
            </Link>
          ) : (
            <span className="truncate text-[14px] font-semibold text-text-primary">
              {r.garage.name}
            </span>
          )}
          <ScBadge variant={STATUS_BADGE[r.status]}>
            {BYPASS_STATUS_LABELS[r.status]}
          </ScBadge>
          {r.garage.strikes > 0 && (
            <ScBadge variant={r.garage.highlighted ? 'danger' : 'muted'}>
              <span className="font-numeric">
                {strikesLabel(r.garage.strikes)}
              </span>
            </ScBadge>
          )}
          {r.booking.markedTest && <ScBadge variant="muted">Test</ScBadge>}
        </div>
        <p className="font-numeric text-[12px] text-text-secondary">
          {formatWhen(r.createdAt)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
        <Meta label="What happened">{r.kindLabel}</Meta>
        <Meta label="Booking">
          {r.booking.id ? (
            <Link
              href={`/bookings/${r.booking.id}`}
              className="font-numeric text-text-primary underline-offset-2 hover:underline"
            >
              #{r.booking.reference}
            </Link>
          ) : (
            <span className="font-numeric">#{r.booking.reference}</span>
          )}
          {r.booking.scheduledAt && (
            <span className="block font-numeric text-[12px] text-text-muted">
              {formatWhen(r.booking.scheduledAt)}
            </span>
          )}
        </Meta>
        <Meta label="Customer" truncate>
          {r.customer ? (
            <>
              {r.customer.name ?? '—'}
              {r.customer.phone && (
                <span className="block">
                  <PhoneLink
                    phone={r.customer.phone}
                    name={r.customer.name ?? 'the customer'}
                  />
                </span>
              )}
            </>
          ) : (
            'Account deleted'
          )}
        </Meta>
        <Meta
          label={
            r.status === 'dismissed'
              ? 'Dismissed'
              : r.status === 'confirmed'
                ? 'Confirmed'
                : 'Reward'
          }
        >
          {r.status === 'confirmed' ? (
            <>
              <span className="font-numeric">
                {r.confirmedAt ? formatWhen(r.confirmedAt) : ''}
              </span>
              <span className="block text-[12px] text-text-muted">
                by {r.confirmedBy} · {BYPASS_REWARD_LABELS[r.reward.status]}
              </span>
            </>
          ) : r.status === 'dismissed' ? (
            <>
              <span className="font-numeric">
                {r.dismissedAt ? formatWhen(r.dismissedAt) : ''}
              </span>
              <span className="block text-[12px] text-text-muted">
                by {r.dismissedBy}
              </span>
            </>
          ) : (
            'On confirm'
          )}
        </Meta>
      </div>

      {r.note && (
        <p className="whitespace-pre-wrap break-words text-[12px] text-text-primary">
          <span className="text-text-muted">Customer wrote: </span>
          {r.note}
        </p>
      )}
      {r.dismissedReason && (
        <p className="whitespace-pre-wrap break-words text-[12px] text-text-secondary">
          <span className="text-text-muted">Why dismissed: </span>
          {r.dismissedReason}
        </p>
      )}

      {r.status === 'new' && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <ScButton
            onClick={() => onAnswer('confirm')}
            fullWidth={false}
            className="min-h-11 px-4 text-[13px]"
          >
            Confirm
          </ScButton>
          <ScButton
            variant="secondary"
            onClick={() => onAnswer('dismiss')}
            fullWidth={false}
            className="min-h-11 px-4 text-[13px]"
          >
            Dismiss
          </ScButton>
        </div>
      )}
    </ScCard>
  )
}

function BypassReportsList() {
  const router = useRouter()
  const params = useSearchParams()
  const show = parseBypassFilter(params.get('show'))
  const { data, isPending, isPlaceholderData, error, refetch } =
    useAdminBypassReports(show)
  const [answering, setAnswering] = useState<{
    report: AdminBypassReport
    action: 'confirm' | 'dismiss'
    key: number
  } | null>(null)

  // A dead admin session is a redirect, not an error message.
  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  const reports = data?.reports ?? []

  return (
    <>
      <PageHeader
        title="Bypass reports"
        subtitle="Customers telling us a garage asked them to book directly or pay outside Detlio. The garage is never told who reported it."
        actions={
          <Link
            href="/bypass-reports/drop-off"
            className="flex min-h-11 items-center gap-1 text-[13px] font-medium text-text-primary underline-offset-2 hover:underline"
          >
            Customer drop-off
            <IconChevronRight
              size={15}
              aria-hidden
              className="text-text-muted"
            />
          </Link>
        }
      />

      <div>
        <div
          role="group"
          aria-label="Show"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {BYPASS_FILTERS.map((filter) => (
            <FilterChip
              key={filter}
              label={BYPASS_FILTER_LABELS[filter]}
              count={data?.counts[filter]}
              active={show === filter}
              onClick={() =>
                router.replace(bypassListHref(filter), { scroll: false })
              }
              className="min-h-11 rounded-[10px] text-[13px]"
            />
          ))}
        </div>
        <p className="mt-2.5 text-[12px] leading-[1.45] text-text-muted">
          {bypassFilterHint(show, data?.rules)}
        </p>
      </div>

      {isPending ? (
        <SkeletonList count={3} itemClassName="h-36" />
      ) : error && reports.length === 0 ? (
        <ErrorState
          message={errorMessage(error, 'Failed to load reports')}
          onRetry={() => void refetch()}
        />
      ) : reports.length === 0 ? (
        <EmptyState
          icon={<IconFlag size={32} stroke={1.5} />}
          title={EMPTY[show].title}
          subtitle={EMPTY[show].subtitle}
        />
      ) : (
        <ul
          className={cn(
            'flex flex-col gap-2 transition-opacity',
            isPlaceholderData && 'opacity-50'
          )}
          aria-busy={isPlaceholderData}
          aria-label={`${BYPASS_FILTER_LABELS[show]} reports`}
        >
          {reports.map((report, i) => (
            <Reveal as="li" key={report.id} index={i}>
              <ReportCard
                report={report}
                onAnswer={(action) =>
                  setAnswering((last) => ({
                    report,
                    action,
                    key: (last?.key ?? 0) + 1,
                  }))
                }
              />
            </Reveal>
          ))}
        </ul>
      )}

      {answering && data && (
        <BypassAnswerDialog
          key={answering.key}
          report={answering.report}
          action={answering.action}
          rewardAmount={data.rules.rewardAmount}
          creditOn={data.rules.creditOn}
          onClose={() => setAnswering(null)}
        />
      )}
    </>
  )
}

export default function AdminBypassReportsPage() {
  // useSearchParams needs a Suspense boundary, or Next.js refuses to
  // prerender the page.
  return (
    <Suspense fallback={<SkeletonList count={3} itemClassName="h-36" />}>
      <BypassReportsList />
    </Suspense>
  )
}
