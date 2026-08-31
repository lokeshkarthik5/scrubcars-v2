'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconCalendar } from '@tabler/icons-react'
import { bookingStatusBadge, ScBadge } from '@repo/ui/sc/badge'
import { ScCard } from '@repo/ui/sc/card'
import { FilterChip } from '@repo/ui/sc/chip'
import { EmptyState, ErrorState, SkeletonCard } from '@repo/ui/sc/empty-state'
import { TopBar } from '@repo/ui/sc/top-bar'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { useAdminBookings } from '@repo/core/api/hooks/use-admin-vendors'
import { formatBookingAmount } from '@repo/core/pricing'
import { APP_TIMEZONE } from '@repo/core/utils'

const STATUSES = ['all', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'] as const

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: APP_TIMEZONE,
  })
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <div className="truncate text-[12px] text-text-secondary">{children}</div>
    </div>
  )
}

export default function AdminBookingsPage() {
  const router = useRouter()
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all')

  const { data, isPending, error, refetch } = useAdminBookings(status)
  const bookings = data ?? []
  const loading = isPending

  // A dead admin session is a redirect, not an error message.
  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  return (
    <>
      <TopBar
        title="Bookings"
        right={
          !loading && !error ? (
            <ScBadge variant="muted">{bookings.length} shown</ScBadge>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <FilterChip
            key={s}
            label={s === 'all' ? 'All' : bookingStatusBadge(s).label}
            active={status === s}
            onClick={() => setStatus(s)}
          />
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : error ? (
        <ErrorState
          message={errorMessage(error, 'Failed to load bookings')}
          onRetry={() => void refetch()}
        />
      ) : bookings.length === 0 ? (
        <EmptyState
          icon={<IconCalendar size={32} stroke={1.5} />}
          title="No bookings found"
          subtitle={
            status === 'all'
              ? 'Bookings will appear here once customers start booking.'
              : 'Try a different status filter.'
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {bookings.map((b) => {
            const badge = bookingStatusBadge(b.status)
            return (
              <ScCard key={b.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-text-primary">
                      {b.user?.name ?? '—'}
                    </p>
                    <p className="text-[11px] text-text-secondary">
                      {b.user?.phone ?? '—'} · {formatDate(b.scheduledAt)}
                    </p>
                  </div>
                  <ScBadge variant={badge.variant}>{badge.label}</ScBadge>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                  <Meta label="Vendor">{b.vendor?.businessName ?? '—'}</Meta>
                  <Meta label="Service">{b.service?.name ?? '—'}</Meta>
                  <Meta label="Type">
                    <span className="capitalize">{b.bookingType.replace('_', ' ')}</span>
                  </Meta>
                  <Meta label="Amount">
                    <span className="font-medium text-text-primary">
                      {formatBookingAmount(Number(b.amount))}
                    </span>
                    {/* Only a discounted booking shows the strike-through and
                        who funded the difference. */}
                    {Number(b.discountAmount) > 0 && (
                      <span className="text-text-muted">
                        {' '}
                        <s>{formatBookingAmount(Number(b.subtotalAmount))}</s>
                      </span>
                    )}
                  </Meta>
                </div>

                {Number(b.discountAmount) > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3 text-[11px]">
                    <ScBadge variant="success">
                      {b.discountCode ?? 'Discount'}
                    </ScBadge>
                    <span className="text-text-secondary">
                      −{formatBookingAmount(Number(b.discountAmount))}
                    </span>
                    <span className="text-text-muted">
                      ·{' '}
                      {b.discountFundedBy === 'platform'
                        ? 'Detlio funded'
                        : 'Garage funded'}
                    </span>
                  </div>
                )}
              </ScCard>
            )
          })}
        </div>
      )}
    </>
  )
}
