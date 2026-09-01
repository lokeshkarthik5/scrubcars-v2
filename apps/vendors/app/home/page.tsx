'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AppShell } from '@repo/ui/sc/app-shell'
import { bookingStatusBadge, ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { StarRating } from '@repo/ui/sc/stars'
import { getEarningsData } from '@repo/core/api/earnings'
import { getVendorReviews } from '@repo/core/api/reviews'
import { getMyVendor } from '@repo/core/api/vendors'
import type { ApiVendorProfile } from '@repo/core/api/types'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { toast } from 'react-toastify'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import { computeVendorDashboardStats } from '@repo/core/vendor-stats'
import type { Review } from '@repo/core/types'

export default function VendorHomePage() {
  const user = useAuthStore((s) => s.user)
  const vendor = useAuthStore((s) => s.vendor)
  const vendorBookings = useBookingsStore((s) => s.vendorBookings)
  const fetchVendorBookings = useBookingsStore((s) => s.fetchVendorBookings)
  const updateStatus = useBookingsStore((s) => s.updateStatus)
  const [reviews, setReviews] = useState<Review[]>([])
  const [profile, setProfile] = useState<ApiVendorProfile | null>(null)
  const [weekEarnings, setWeekEarnings] = useState<number | null>(null)
  const isVendorAdmin = useIsVendorAdmin()

  const isVerified = vendor?.isVerified ?? false
  // Only meaningful once the profile has loaded — `null` while loading must not
  // flash a "location missing" warning at a garage that has one.
  const needsLocation = profile !== null && profile.lat === null
  const pending = useMemo(
    () => vendorBookings.filter((b) => b.status === 'pending'),
    [vendorBookings]
  )
  const stats = useMemo(
    () => computeVendorDashboardStats(vendorBookings, reviews),
    [vendorBookings, reviews]
  )

  useEffect(() => {
    if (!vendor?.id) return
    void Promise.all([
      fetchVendorBookings(),
      getVendorReviews(vendor.id).then(setReviews),
      // The session's vendor summary carries no coordinates, so the full
      // profile is needed to know whether the garage has been pinned.
      getMyVendor().then(setProfile).catch(() => undefined),
    ])
  }, [vendor?.id, fetchVendorBookings])

  // Money is a separate call now, and an operator's home page never makes it —
  // gating the Earnings tab alone would have left this tile on their landing
  // page, which is the easiest half of the boundary to miss.
  useEffect(() => {
    if (!vendor?.id || !isVendorAdmin) return
    void getEarningsData().then((data) => setWeekEarnings(data.weekEarnings))
  }, [vendor?.id, isVendorAdmin])

  return (
    <AppShell showNav navType="vendor" className="gap-5 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">
          Good morning, {user?.name?.split(' ')[0] ?? 'there'}
        </h1>
        {/* Notifications not wired up yet — hidden until the backend is ready. */}
        {/* <button className="text-text-secondary"><IconBell size={22} /></button> */}
      </div>

      {/* Ordered by what actually blocks the garage. An unpinned garage cannot
          be verified at all, so telling them "under review" first would be
          misleading — there is nothing to review until they act. */}
      {needsLocation ? (
        <Link
          href="/settings"
          className="block rounded-[10px] border-l-[3px] border-warning bg-warning-muted/30 px-3 py-2.5 text-[13px] text-text-primary"
        >
          <span className="font-medium">Set your garage location</span>
          <span className="mt-0.5 block text-[12px] text-text-secondary">
            Customers can&apos;t find you until your garage is on the map, and
            we can&apos;t verify you without it. Tap to pin it.
          </span>
        </Link>
      ) : (
        !isVerified && (
          <div className="rounded-[10px] border-l-[3px] border-warning bg-warning-muted/30 px-3 py-2.5 text-[13px] text-text-primary">
            Your profile is under review. You&apos;ll be notified once verified.
          </div>
        )
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
        {isVendorAdmin && (
          <ScCard>
            <p className="text-[11px] text-text-secondary">This week (₹)</p>
            <p className="text-lg font-semibold text-text-primary">
              {(weekEarnings ?? 0).toLocaleString('en-IN')}
            </p>
          </ScCard>
        )}
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
          <Link href="/bookings" className="text-[12px] font-medium text-brand-red">See all</Link>
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
                      <p className="text-[11px] text-text-secondary">{b.serviceSummary} · {b.scheduledAt}</p>
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
