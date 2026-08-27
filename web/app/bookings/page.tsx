'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/sc/app-shell'
import { bookingStatusBadge, ScBadge } from '@/components/sc/badge'
import { ScButton } from '@/components/sc/button'
import { ScCard } from '@/components/sc/card'
import { Reveal } from '@/components/sc/reveal'
import { EmptyState } from '@/components/sc/empty-state'
import { TopBar } from '@/components/sc/top-bar'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useBookingsStore } from '@/lib/stores/bookings-store'
import { formatBookingAmount } from '@/lib/pricing'

export default function BookingsListPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const customerBookings = useBookingsStore((s) => s.customerBookings)
  const fetchCustomerBookings = useBookingsStore((s) => s.fetchCustomerBookings)

  useEffect(() => {
    if (user) void fetchCustomerBookings()
  }, [user, fetchCustomerBookings])

  if (!user) {
    return (
      <AppShell showNav showBrand className="gap-4 py-4">
        <TopBar title="Bookings" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-[15px] font-semibold text-text-primary">Login to view your bookings</p>
          <p className="text-[13px] text-text-secondary">Sign in to see your booking history</p>
          <ScButton className="mt-2 w-auto px-8" onClick={() => router.push('/login')}>Login</ScButton>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell showNav showBrand className="gap-4 py-4">
      <TopBar title="Bookings" />

      {customerBookings.length === 0 ? (
        <EmptyState
          title="No bookings yet"
          subtitle="Book your first car wash"
          actionLabel="Find garages"
          onAction={() => (window.location.href = '/search')}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {customerBookings.map((booking, i) => {
            const badge = bookingStatusBadge(booking.status)
            return (
              <Reveal key={booking.id} index={i}>
              <Link href={`/bookings/${booking.id}`}>
                <ScCard className="press flex flex-col gap-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[13px] font-semibold text-text-primary">{booking.serviceName}</p>
                      <p className="text-[11px] text-text-secondary">{booking.vendorName}</p>
                    </div>
                    <ScBadge variant={badge.variant}>{badge.label}</ScBadge>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-text-secondary">
                    <span>{booking.scheduledAt}</span>
                    <span className="flex items-center gap-1.5">
                      {/* The struck price is the only hint that a code was
                          used; the full breakdown lives on the detail page. */}
                      {booking.discountAmount > 0 && (
                        <s className="text-text-muted">
                          {formatBookingAmount(booking.subtotalPrice)}
                        </s>
                      )}
                      <span className="font-semibold text-text-primary">
                        {formatBookingAmount(booking.servicePrice)}
                      </span>
                    </span>
                  </div>
                </ScCard>
              </Link>
              </Reveal>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
