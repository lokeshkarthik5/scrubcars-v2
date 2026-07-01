'use client'

import { useEffect, useState } from 'react'
import { AppShell } from '@/components/sc/app-shell'
import { bookingStatusBadge, ScBadge } from '@/components/sc/badge'
import { ScButton } from '@/components/sc/button'
import { ScCard } from '@/components/sc/card'
import { StarRating } from '@/components/sc/stars'
import { TopBar } from '@/components/sc/top-bar'
import { useBookingsStore } from '@/lib/stores/bookings-store'
import type { Booking } from '@/lib/types'
import { cn } from '@/lib/utils'

type Tab = 'incoming' | 'upcoming' | 'completed'

export default function VendorBookingsPage() {
  const [tab, setTab] = useState<Tab>('incoming')
  const vendorBookings = useBookingsStore((s) => s.vendorBookings)
  const fetchVendorBookings = useBookingsStore((s) => s.fetchVendorBookings)
  const updateStatus = useBookingsStore((s) => s.updateStatus)

  useEffect(() => {
    void fetchVendorBookings()
  }, [fetchVendorBookings])

  const filtered = vendorBookings.filter((b) => {
    if (tab === 'incoming') return b.status === 'pending'
    if (tab === 'upcoming') return b.status === 'confirmed' || b.status === 'in_progress'
    return b.status === 'completed'
  })

  const pendingCount = vendorBookings.filter((b) => b.status === 'pending').length

  const handleStatus = async (id: string, status: Booking['status']) => {
    await updateStatus(id, status)
    await fetchVendorBookings()
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'incoming', label: 'Incoming' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'completed', label: 'Completed' },
  ]

  return (
    <AppShell showNav navType="vendor" className="gap-4 py-4">
      <TopBar
        title="Bookings"
        right={
          pendingCount > 0 ? (
            <ScBadge variant="accent">{pendingCount} new</ScBadge>
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
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map((b) => {
          const badge = bookingStatusBadge(b.status)
          return (
            <ScCard key={b.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[13px] font-semibold">{b.customerName}</p>
                  <p className="text-[11px] text-text-secondary">{b.serviceName} · {b.scheduledAt}</p>
                  <ScBadge variant="muted" className="mt-1">
                    {b.bookingType === 'doorstep' ? 'Doorstep' : 'Drop-in'}
                  </ScBadge>
                </div>
                <ScBadge variant={badge.variant}>{badge.label}</ScBadge>
              </div>

              {b.vehicle && (
                <p className="text-[11px] text-text-secondary">
                  {b.vehicle.make} {b.vehicle.model} · {b.vehicle.plate}
                </p>
              )}

              {tab === 'incoming' && (
                <div className="grid grid-cols-2 gap-2">
                  <ScButton variant="secondary" onClick={() => handleStatus(b.id, 'cancelled')}>Reject</ScButton>
                  <ScButton onClick={() => handleStatus(b.id, 'confirmed')}>Accept</ScButton>
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
            </ScCard>
          )
        })}
      </div>
    </AppShell>
  )
}
