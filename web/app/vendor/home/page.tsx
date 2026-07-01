'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { IconBell } from '@tabler/icons-react'
import { AppShell } from '@/components/sc/app-shell'
import { bookingStatusBadge, ScBadge } from '@/components/sc/badge'
import { ScButton } from '@/components/sc/button'
import { ScCard } from '@/components/sc/card'
import { StarRating } from '@/components/sc/stars'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useBookingsStore } from '@/lib/stores/bookings-store'

export default function VendorHomePage() {
  const user = useAuthStore((s) => s.user)
  const vendor = useAuthStore((s) => s.vendor)
  const vendorBookings = useBookingsStore((s) => s.vendorBookings)
  const fetchVendorBookings = useBookingsStore((s) => s.fetchVendorBookings)
  const updateStatus = useBookingsStore((s) => s.updateStatus)

  const isVerified = vendor?.isVerified ?? false
  const pending = vendorBookings.filter((b) => b.status === 'pending')
  const todaysJobs = vendorBookings.filter((b) =>
    ['confirmed', 'in_progress'].includes(b.status)
  ).length

  useEffect(() => {
    void fetchVendorBookings()
  }, [fetchVendorBookings])

  return (
    <AppShell showNav navType="vendor" className="gap-5 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">
          Good morning, {user?.name?.split(' ')[0] ?? 'there'}
        </h1>
        <button className="text-text-secondary"><IconBell size={22} /></button>
      </div>

      {!isVerified && (
        <div className="rounded-[10px] border-l-[3px] border-warning bg-warning-muted/30 px-3 py-2.5 text-[13px] text-text-primary">
          Your profile is under review. You&apos;ll be notified once verified.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Today's jobs", value: todaysJobs },
          { label: 'Pending requests', value: pending.length },
          { label: 'This week (₹)', value: '—' },
          { label: 'Avg rating', value: 4.5, stars: true },
        ].map((stat) => (
          <ScCard key={stat.label}>
            <p className="text-[11px] text-text-secondary">{stat.label}</p>
            {stat.stars ? (
              <StarRating rating={4.5} />
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
          {pending.slice(0, 3).map((b) => {
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
                  <ScButton variant="secondary" onClick={() => updateStatus(b.id, 'cancelled')}>Reject</ScButton>
                  <ScButton onClick={() => updateStatus(b.id, 'confirmed')}>Accept</ScButton>
                </div>
              </ScCard>
            )
          })}
        </div>
      </section>
    </AppShell>
  )
}
