'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconBell } from '@tabler/icons-react'
import { AppShell } from '@/components/sc/app-shell'
import { bookingStatusBadge, ScBadge } from '@/components/sc/badge'
import { ScButton } from '@/components/sc/button'
import { ScCard } from '@/components/sc/card'
import { StarRating } from '@/components/sc/stars'
import { getVendorReviews } from '@/lib/api/reviews'
import { toast } from 'react-toastify'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useBookingsStore } from '@/lib/stores/bookings-store'
import { computeVendorDashboardStats } from '@/lib/vendor-stats'
import type { Review } from '@/lib/types'

export default function VendorHomePage() {
  const user = useAuthStore((s) => s.user)
  const vendor = useAuthStore((s) => s.vendor)
  const vendorBookings = useBookingsStore((s) => s.vendorBookings)
  const fetchVendorBookings = useBookingsStore((s) => s.fetchVendorBookings)
  const updateStatus = useBookingsStore((s) => s.updateStatus)
  const [reviews, setReviews] = useState<Review[]>([])

  const isVerified = vendor?.isVerified ?? false
  const pending = vendorBookings.filter((b) => b.status === 'pending')
  const stats = computeVendorDashboardStats(vendorBookings, reviews)

  useEffect(() => {
    void fetchVendorBookings()
  }, [fetchVendorBookings])

  useEffect(() => {
    if (!vendor?.id) return
    getVendorReviews(vendor.id).then(setReviews)
  }, [vendor?.id])

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
        <ScCard>
          <p className="text-[11px] text-text-secondary">Today&apos;s jobs</p>
          <p className="text-lg font-semibold text-text-primary">{stats.todaysJobs}</p>
        </ScCard>
        <ScCard>
          <p className="text-[11px] text-text-secondary">Pending requests</p>
          <p className="text-lg font-semibold text-text-primary">{stats.pendingRequests}</p>
        </ScCard>
        <ScCard>
          <p className="text-[11px] text-text-secondary">This week (₹)</p>
          <p className="text-lg font-semibold text-text-primary">
            {stats.weekEarnings.toLocaleString('en-IN')}
          </p>
        </ScCard>
        <ScCard>
          <p className="text-[11px] text-text-secondary">Avg rating</p>
          {stats.reviewCount > 0 ? (
            <StarRating rating={stats.avgRating} />
          ) : (
            <p className="text-lg font-semibold text-text-primary">0</p>
          )}
        </ScCard>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Incoming bookings</h2>
          <Link href="/vendor/bookings" className="text-[12px] font-medium text-brand-red">See all</Link>
        </div>
        <div className="flex flex-col gap-2">
          {pending.length === 0 ? (
            <ScCard>
              <p className="text-[11px] text-text-secondary">Incoming bookings</p>
              <p className="text-lg font-semibold text-text-primary">0</p>
            </ScCard>
          ) : (
            pending.slice(0, 3).map((b) => {
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
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <ScButton variant="secondary" onClick={() => updateStatus(b.id, 'cancelled').then(() => toast.success('Booking rejected')).catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to reject'))}>Reject</ScButton>
                    <ScButton onClick={() => updateStatus(b.id, 'confirmed').then(() => toast.success('Booking accepted')).catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to accept'))}>Accept</ScButton>
                  </div>
                </ScCard>
              )
            })
          )}
        </div>
      </section>
    </AppShell>
  )
}
