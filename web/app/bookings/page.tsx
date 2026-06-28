'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AppShell } from '@/components/sc/app-shell'
import { bookingStatusBadge, ScBadge } from '@/components/sc/badge'
import { ScCard } from '@/components/sc/card'
import { EmptyState } from '@/components/sc/empty-state'
import { TopBar } from '@/components/sc/top-bar'
import { getCustomerBookings } from '@/lib/api/bookings'
import type { Booking } from '@/lib/types'

export default function BookingsListPage() {
  const [bookings, setBookings] = useState<Booking[]>([])

  useEffect(() => {
    getCustomerBookings().then(setBookings)
  }, [])

  return (
    <AppShell showNav className="gap-4 py-4">
      <TopBar title="Bookings" />

      {bookings.length === 0 ? (
        <EmptyState
          title="No bookings yet"
          subtitle="Book your first car wash"
          actionLabel="Find garages"
          onAction={() => (window.location.href = '/search')}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {bookings.map((booking) => {
            const badge = bookingStatusBadge(booking.status)
            return (
              <Link key={booking.id} href={`/bookings/${booking.id}`}>
                <ScCard className="flex flex-col gap-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[13px] font-semibold text-text-primary">{booking.serviceName}</p>
                      <p className="text-[11px] text-text-secondary">{booking.vendorName}</p>
                    </div>
                    <ScBadge variant={badge.variant}>{badge.label}</ScBadge>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-text-secondary">
                    <span>{booking.scheduledAt}</span>
                    <span className="font-semibold text-text-primary">₹{booking.servicePrice}</span>
                  </div>
                </ScCard>
              </Link>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
