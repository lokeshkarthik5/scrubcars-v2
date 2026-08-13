'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconCalendar } from '@tabler/icons-react'
import { bookingStatusBadge, ScBadge } from '@/components/sc/badge'
import { ScCard } from '@/components/sc/card'
import { FilterChip } from '@/components/sc/chip'
import { EmptyState, ErrorState, SkeletonCard } from '@/components/sc/empty-state'
import { TopBar } from '@/components/sc/top-bar'
import { ApiError } from '@/lib/api/client'
import { listAdminBookings, type AdminBooking } from '@/lib/api/admin'
import { formatBookingAmount } from '@/lib/pricing'
import { APP_TIMEZONE } from '@/lib/utils'

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
  const [bookings, setBookings] = useState<AdminBooking[]>([])
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setBookings(await listAdminBookings(status === 'all' ? undefined : status))
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace('/admin/login')
        return
      }
      setError('Failed to load bookings')
    } finally {
      setLoading(false)
    }
  }, [router, status])

  useEffect(() => {
    void load()
  }, [load])

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
        <ErrorState message={error} onRetry={load} />
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
                  </Meta>
                </div>
              </ScCard>
            )
          })}
        </div>
      )}
    </>
  )
}
