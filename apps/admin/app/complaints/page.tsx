'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconAlertTriangle, IconMessageReport, IconPlus } from '@tabler/icons-react'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { FilterChip } from '@repo/ui/sc/chip'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { PageHeader } from '@repo/ui/sc/page-header'
import { Reveal } from '@repo/ui/sc/reveal'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import type { AdminComplaint, AdminComplaintFilter } from '@repo/core/api/admin'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { useAdminComplaints } from '@repo/core/api/hooks/use-admin-complaints'
import {
  COMPLAINT_ACKNOWLEDGE_HOURS,
  COMPLAINT_ADMIN_STATUS_LABELS,
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_RESOLVE_DAYS,
  complaintClockLine,
} from '@repo/core/complaints'
import { cn } from '@repo/core/utils'
import { LogComplaintDialog } from '@/components/log-complaint-dialog'
import { Meta } from '@/components/meta'
import { formatClock, formatWhen } from '@/lib/bookings'
import {
  COMPLAINT_FILTERS,
  COMPLAINT_FILTER_LABELS,
  complaintFilterHint,
  complaintSourceLine,
  complaintsListHref,
  overdueLabel,
  parseComplaintFilter,
} from '@/lib/complaints'

/** Waiting on the team is the neutral outline; done is green or grey. Amber is for overdue alone. */
const STATUS_BADGE: Record<AdminComplaint['status'], 'pending' | 'success' | 'muted'> = {
  open: 'pending',
  acknowledged: 'pending',
  resolved: 'success',
  closed: 'muted',
}

const EMPTY: Record<AdminComplaintFilter, { title: string; subtitle: string }> = {
  open: {
    title: 'No open complaints',
    subtitle:
      'A complaint raised in the app, or logged here from a call or a message, shows up here and in the team’s Telegram group.',
  },
  overdue: { title: 'Nothing overdue', subtitle: 'Every open complaint is inside its time.' },
  resolved: { title: 'Nothing resolved yet', subtitle: 'Resolved and closed complaints show up here.' },
  all: {
    title: 'No complaints yet',
    subtitle: 'Customers raise them from a booking’s Help or the Contact page; log one that came another way with Log a complaint.',
  },
}

function ComplaintRow({
  complaint: c,
  now,
  back,
}: {
  complaint: AdminComplaint
  /** The server's clock when the list was read, so the clock line and Overdue agree. */
  now: Date
  /** This list as it is now, for the detail's back arrow. */
  back: string
}) {
  const overdue = overdueLabel(c)
  return (
    // The number is a stretched link: the whole card opens the complaint.
    <ScCard
      className={cn(
        'relative flex flex-col gap-2.5 transition-colors hover:border-text-muted',
        overdue && 'border-warning/60'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Link
            href={`/complaints/${c.id}?back=${encodeURIComponent(back)}`}
            aria-label={`Open complaint ${c.number} from ${c.customer.name}`}
            className="font-numeric text-[14px] font-semibold text-text-primary after:absolute after:inset-0 after:rounded-[14px] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-text-secondary"
          >
            {c.number}
          </Link>
          <ScBadge variant={STATUS_BADGE[c.status]}>{COMPLAINT_ADMIN_STATUS_LABELS[c.status]}</ScBadge>
          {overdue && (
            <ScBadge variant="danger">
              <IconAlertTriangle size={11} aria-hidden className="mr-1" />
              {overdue}
            </ScBadge>
          )}
        </div>
        <p className={cn('font-numeric text-[12px]', overdue ? 'text-warning' : 'text-text-secondary')}>
          {complaintClockLine({ status: c.status, receivedAt: new Date(c.receivedAt) }, now)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
        <Meta label="About">{COMPLAINT_CATEGORY_LABELS[c.category]}</Meta>
        <Meta label="Customer" truncate>
          {c.customer.name}
        </Meta>
        <Meta label="Garage" truncate>
          {c.garage?.name ?? '—'}
          {c.booking && (
            <span className="font-numeric text-text-muted"> · #{c.booking.reference}</span>
          )}
        </Meta>
        <Meta label="Received">
          <span className="font-numeric">{formatWhen(c.receivedAt)}</span>
          <span className="block text-[12px] text-text-muted">{complaintSourceLine(c)}</span>
        </Meta>
      </div>

      <p className="line-clamp-2 whitespace-pre-wrap break-words text-[12px] text-text-primary">{c.message}</p>
    </ScCard>
  )
}

function ComplaintsList() {
  const router = useRouter()
  const params = useSearchParams()
  // The chip lives in the URL, so Back from a complaint returns to it.
  const show = parseComplaintFilter(params.get('show'))
  const back = complaintsListHref(show)

  const { data, isPending, isPlaceholderData, error, refetch, dataUpdatedAt } = useAdminComplaints(show)

  // A dead admin session is a redirect, not an error message.
  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  const complaints = data?.complaints ?? []
  const now = data ? new Date(data.now) : new Date(dataUpdatedAt || 0)
  // Bumped on each open, so the dialog starts empty every time.
  const [logging, setLogging] = useState(0)
  const [logOpen, setLogOpen] = useState(false)
  const refreshFailed = Boolean(error) && complaints.length > 0

  return (
    <>
      <PageHeader
        title="Complaints"
        subtitle={
          <>
            Acknowledge each within <span className="font-numeric">{COMPLAINT_ACKNOWLEDGE_HOURS}</span>{' '}
            hours and resolve it within <span className="font-numeric">{COMPLAINT_RESOLVE_DAYS}</span>{' '}
            days of when it was received: the Contact page promises both.
          </>
        }
        actions={
          <ScButton
            fullWidth={false}
            onClick={() => {
              setLogging((n) => n + 1)
              setLogOpen(true)
            }}
            className="min-h-11 px-4 text-[13px]"
          >
            <span className="flex items-center gap-1.5">
              <IconPlus size={16} aria-hidden />
              Log a complaint
            </span>
          </ScButton>
        }
      />

      <LogComplaintDialog key={logging} open={logOpen} onClose={() => setLogOpen(false)} />

      <div>
        {/* One row that scrolls sideways on a phone, like the garage list's. */}
        <div
          role="group"
          aria-label="Show"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {COMPLAINT_FILTERS.map((filter) => (
            <FilterChip
              key={filter}
              label={COMPLAINT_FILTER_LABELS[filter]}
              count={data?.counts[filter]}
              active={show === filter}
              onClick={() => router.replace(complaintsListHref(filter), { scroll: false })}
              className={cn(
                'min-h-11 rounded-[10px] text-[13px]',
                // Overdue with anything in it is the one chip that is a problem.
                filter === 'overdue' && (data?.counts.overdue ?? 0) > 0 && show !== 'overdue' && 'border-warning/60 text-warning'
              )}
            />
          ))}
        </div>
        <p className="mt-2.5 text-[12px] leading-[1.45] text-text-muted">{complaintFilterHint(show)}</p>
        {/* Bypass reports (0052) have no room in the phone's bottom bar. */}
        <Link
          href="/bypass-reports"
          className="mt-1 inline-flex min-h-11 items-center gap-1 text-[12px] font-medium text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
        >
          Garage asked a customer to book directly? Bypass reports
        </Link>
      </div>

      {refreshFailed && (
        <p role="status" className="text-[12px] text-error">
          Couldn&apos;t refresh. Showing complaints as of{' '}
          <span className="font-numeric">{formatClock(dataUpdatedAt)}</span>.
        </p>
      )}

      {isPending ? (
        <SkeletonList count={3} itemClassName="h-36" />
      ) : error && complaints.length === 0 ? (
        <ErrorState
          message={errorMessage(error, 'Failed to load complaints')}
          onRetry={() => void refetch()}
        />
      ) : complaints.length === 0 ? (
        <EmptyState
          icon={<IconMessageReport size={32} stroke={1.5} />}
          title={EMPTY[show].title}
          subtitle={EMPTY[show].subtitle}
        />
      ) : (
        // The last chip's list stays up, dimmed, until the new one lands.
        <ul
          className={cn('flex flex-col gap-2 transition-opacity', isPlaceholderData && 'opacity-50')}
          aria-busy={isPlaceholderData}
          aria-label={`${COMPLAINT_FILTER_LABELS[show]} complaints`}
        >
          {complaints.map((complaint, i) => (
            <Reveal as="li" key={complaint.id} index={i}>
              <ComplaintRow complaint={complaint} now={now} back={back} />
            </Reveal>
          ))}
        </ul>
      )}
    </>
  )
}

export default function AdminComplaintsPage() {
  // useSearchParams needs a Suspense boundary, or Next.js refuses to
  // prerender the page.
  return (
    <Suspense fallback={<SkeletonList count={3} itemClassName="h-36" />}>
      <ComplaintsList />
    </Suspense>
  )
}
