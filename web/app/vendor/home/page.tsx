'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconBell } from '@tabler/icons-react'
import { AppShell } from '@/components/sc/app-shell'
import { bookingStatusBadge, ScBadge } from '@/components/sc/badge'
import { ScButton } from '@/components/sc/button'
import { ScCard } from '@/components/sc/card'
import { StarRating } from '@/components/sc/stars'
import { getVendorBookings } from '@/lib/api/bookings'
import { MOCK_VENDOR_STATS } from '@/lib/mock/data'
import type { Booking } from '@/lib/types'

export default function VendorHomePage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const stats = MOCK_VENDOR_STATS
  const isVerified = false

  useEffect(() => {
    getVendorBookings().then((all) =>
      setBookings(all.filter((b) => b.status === 'pending').slice(0, 3))
    )
  }, [])

  return (
    <AppShell showNav navType="vendor" className="gap-5 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Good morning, Raj</h1>
        <button className="text-text-secondary"><IconBell size={22} /></button>
      </div>

      {!isVerified && (
        <div className="rounded-[10px] border-l-[3px] border-warning bg-warning-muted/30 px-3 py-2.5 text-[13px] text-text-primary">
          Your profile is under review. You&apos;ll be notified once verified.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Today's jobs", value: stats.todaysJobs },
          { label: 'Pending requests', value: stats.pendingRequests },
          { label: 'This week (₹)', value: stats.weekEarnings.toLocaleString('en-IN') },
          { label: 'Avg rating', value: stats.avgRating, stars: true },
        ].map((stat) => (
          <ScCard key={stat.label}>
            <p className="text-[11px] text-text-secondary">{stat.label}</p>
            {stat.stars ? (
              <StarRating rating={stats.avgRating} />
            ) : (
              <p className="text-lg font-semibold text-text-primary">{stat.value}</p>
            )}
          </ScCard>
        ))}
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Incoming bookings</h2>
          <Link href="/vendor/bookings" className="text-[12px] font-medium text-brand-red">See all</Link>
        </div>
        <div className="flex flex-col gap-2">
          {bookings.map((b) => {
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
                <ScBadge variant="muted">{b.bookingType === 'doorstep' ? 'Doorstep' : 'Drop-in'}</ScBadge>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <ScButton variant="secondary">Reject</ScButton>
                  <ScButton>Accept</ScButton>
                </div>
              </ScCard>
            )
          })}
        </div>
      </section>
    </AppShell>
  )
}
