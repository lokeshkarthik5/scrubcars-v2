'use client'

import { useEffect, useMemo, useState } from 'react'
import { IconCheck } from '@tabler/icons-react'
import { AppShell } from '@repo/ui/sc/app-shell'
import { bookingStatusBadge, ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { ScInput } from '@repo/ui/sc/input'
import { StarRating } from '@repo/ui/sc/stars'
import { TopBar } from '@repo/ui/sc/top-bar'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import type { Booking } from '@repo/core/types'
import { formatDuration } from '@repo/core/utils'

type Tab = 'incoming' | 'upcoming' | 'completed' | 'cancelled'

export default function VendorBookingsPage() {
  const [tab, setTab] = useState<Tab>('incoming')
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const vendorBookings = useBookingsStore((s) => s.vendorBookings)
  const fetchVendorBookings = useBookingsStore((s) => s.fetchVendorBookings)
  const updateStatus = useBookingsStore((s) => s.updateStatus)

  useEffect(() => {
    void fetchVendorBookings()
    // Poll so vendors see new/updated bookings live (~10s).
    const interval = setInterval(() => {
      void fetchVendorBookings()
    }, 10000)
    return () => clearInterval(interval)
  }, [fetchVendorBookings])

  const { filtered, incomingCount, upcomingCount, completedCount, cancelledCount } = useMemo(() => {
    let incoming = 0, upcoming = 0, completed = 0, cancelled = 0
    const result: typeof vendorBookings = []
    for (const b of vendorBookings) {
      if (b.status === 'pending') {
        incoming++
        if (tab === 'incoming') result.push(b)
      } else if (b.status === 'confirmed' || b.status === 'in_progress') {
        upcoming++
        if (tab === 'upcoming') result.push(b)
      } else if (b.status === 'completed') {
        completed++
        if (tab === 'completed') result.push(b)
      } else if (b.status === 'cancelled') {
        cancelled++
        if (tab === 'cancelled') result.push(b)
      }
    }
    return { filtered: result, incomingCount: incoming, upcomingCount: upcoming, completedCount: completed, cancelledCount: cancelled }
  }, [vendorBookings, tab])

  const handleStatus = async (id: string, status: Booking['status']) => {
    await updateStatus(id, status)
  }

  const handleReject = async (id: string) => {
    await updateStatus(id, 'cancelled', rejectReason.trim() || undefined)
    setRejectId(null)
    setRejectReason('')
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'incoming', label: 'Incoming', count: incomingCount },
    { key: 'upcoming', label: 'Upcoming', count: upcomingCount },
    { key: 'completed', label: 'Completed', count: completedCount },
    { key: 'cancelled', label: 'Cancelled', count: cancelledCount },
  ]

  return (
    <AppShell showNav navType="vendor" className="gap-4 py-4">
      <TopBar
        title="Bookings"
        right={
          incomingCount > 0 ? (
            <ScBadge variant="accent">{incomingCount} new</ScBadge>
          ) : undefined
        }
      />

      <ScSegmented
        aria-label="Filter bookings by status"
        value={tab}
        onChange={setTab}
        options={tabs.map((t) => ({
          value: t.key,
          label: `${t.label} (${t.count})`,
        }))}
      />

      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <ScCard>
            <p className="text-[11px] capitalize text-text-secondary">{tab} bookings</p>
            <p className="text-lg font-semibold text-text-primary">0</p>
          </ScCard>
        ) : (
          filtered.map((b) => {
          const badge = bookingStatusBadge(b.status)
          return (
            <ScCard key={b.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[13px] font-semibold">{b.customerName}</p>
                  <p className="text-[11px] text-text-secondary">{b.serviceSummary} · {b.scheduledAt}</p>
                </div>
                <ScBadge variant={badge.variant}>{badge.label}</ScBadge>
              </div>

              {/* The summary line above says "+2 more"; whoever does the work
                  needs the actual list, so a multi-service job spells it out.
                  A single-service job reads exactly as it always did. */}
              {b.items.length > 1 && (
                <ul className="flex flex-col gap-0.5">
                  {b.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-1.5 text-[11px] text-text-secondary"
                    >
                      <IconCheck size={12} className="shrink-0 text-brand-red" />
                      {item.name}
                      <span className="text-text-muted">
                        · {formatDuration(item.durationMins)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {b.vehicle && (
                <p className="text-[11px] text-text-secondary">
                  {b.vehicle.make} {b.vehicle.model} · {b.vehicle.plate}
                </p>
              )}

              {tab === 'incoming' && rejectId !== b.id && (
                <div className="grid grid-cols-2 gap-2">
                  {/* A list of identical "Accept" buttons announces as a list of
                      identical "Accept" buttons; the name has to say whose job
                      it is. */}
                  <ScButton
                    variant="secondary"
                    aria-label={`Reject booking for ${b.customerName}`}
                    onClick={() => { setRejectId(b.id); setRejectReason('') }}
                  >
                    Reject
                  </ScButton>
                  <ScButton
                    aria-label={`Accept booking for ${b.customerName}`}
                    onClick={() => handleStatus(b.id, 'confirmed')}
                  >
                    Accept
                  </ScButton>
                </div>
              )}

              {tab === 'incoming' && rejectId === b.id && (
                <div className="flex flex-col gap-2 border-t border-border pt-2">
                  <ScInput
                    placeholder="Reason for rejecting (optional)"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <ScButton variant="secondary" onClick={() => setRejectId(null)}>Keep</ScButton>
                    <ScButton onClick={() => handleReject(b.id)}>Confirm reject</ScButton>
                  </div>
                </div>
              )}

              {tab === 'upcoming' && b.status === 'confirmed' && (
                <ScButton
                  aria-label={`Mark booking for ${b.customerName} in progress`}
                  onClick={() => handleStatus(b.id, 'in_progress')}
                >
                  Mark in progress
                </ScButton>
              )}

              {tab === 'upcoming' && b.status === 'in_progress' && (
                <ScButton
                  aria-label={`Mark booking for ${b.customerName} completed`}
                  onClick={() => handleStatus(b.id, 'completed')}
                >
                  Mark completed
                </ScButton>
              )}

              {tab === 'completed' && b.review && (
                <div className="border-t border-border pt-2">
                  <StarRating rating={b.review.rating} />
                  <p className="mt-1 text-[12px] text-text-secondary">{b.review.comment}</p>
                </div>
              )}

              {tab === 'cancelled' && (
                <div className="border-t border-border pt-2">
                  <p className="text-[12px] font-medium text-text-primary">
                    {b.cancelledBy === 'vendor'
                      ? 'Rejected by you'
                      : b.cancelledBy === 'user'
                        ? 'Cancelled by customer'
                        : 'Cancelled'}
                  </p>
                  {b.cancellationReason && (
                    <p className="mt-1 text-[12px] text-text-secondary">{b.cancellationReason}</p>
                  )}
                </div>
              )}
            </ScCard>
          )
        })
        )}
      </div>
    </AppShell>
  )
}
