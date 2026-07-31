'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/components/sc/app-shell'
import { bookingStatusBadge, ScBadge } from '@/components/sc/badge'
import { ScButton } from '@/components/sc/button'
import { ScCard } from '@/components/sc/card'
import { ScInput } from '@/components/sc/input'
import { StarRating } from '@/components/sc/stars'
import { TopBar } from '@/components/sc/top-bar'
import { useBookingsStore } from '@/lib/stores/bookings-store'
import type { Booking } from '@/lib/types'
import { cn } from '@/lib/utils'

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

      <div className="flex rounded-[10px] bg-surface p-0.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'flex-1 rounded-lg py-2 text-[12px] font-medium',
              tab === t.key ? 'bg-brand-red text-brand-white' : 'text-text-secondary'
            )}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

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
                  <p className="text-[11px] text-text-secondary">{b.serviceName} · {b.scheduledAt}</p>
                </div>
                <ScBadge variant={badge.variant}>{badge.label}</ScBadge>
              </div>

              {b.vehicle && (
                <p className="text-[11px] text-text-secondary">
                  {b.vehicle.make} {b.vehicle.model} · {b.vehicle.plate}
                </p>
              )}

              {tab === 'incoming' && rejectId !== b.id && (
                <div className="grid grid-cols-2 gap-2">
                  <ScButton variant="secondary" onClick={() => { setRejectId(b.id); setRejectReason('') }}>Reject</ScButton>
                  <ScButton onClick={() => handleStatus(b.id, 'confirmed')}>Accept</ScButton>
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
                <ScButton onClick={() => handleStatus(b.id, 'in_progress')}>Mark in progress</ScButton>
              )}

              {tab === 'upcoming' && b.status === 'in_progress' && (
                <ScButton onClick={() => handleStatus(b.id, 'completed')}>Mark completed</ScButton>
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
