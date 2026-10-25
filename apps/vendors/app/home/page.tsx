'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { IconChevronRight, IconInbox } from '@tabler/icons-react'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { Notice } from '@repo/ui/sc/notice'
import { Reveal } from '@repo/ui/sc/reveal'
import { SectionHeader } from '@repo/ui/sc/section-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { StatTile } from '@repo/ui/sc/stat-tile'
import { Stars } from '@repo/ui/sc/stars'
import { TopBar } from '@repo/ui/sc/top-bar'
import { getEarningsData } from '@repo/core/api/earnings'
import { getVendorReviews } from '@repo/core/api/reviews'
import { getMyVendor } from '@repo/core/api/vendors'
import type { ApiVendorProfile } from '@repo/core/api/types'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { formatRupees } from '@repo/core/job-records'
import { toast } from 'react-toastify'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import {
  computeVendorDashboardStats,
  formatRating,
  greetingFor,
  reviewCountLabel,
} from '@repo/core/vendor-stats'
import type { Review } from '@repo/core/types'
import { ActiveGarage } from '@/components/active-garage'
import { CertifiedCard } from '@/components/certified-card'
import { PushBanner } from '@/components/push-banner'
import { JobCardHeader } from '@/components/job-card-header'
import { JobContact } from '@/components/job-contact'
import { useNow } from '@repo/core/hooks/use-now'

export default function VendorHomePage() {
  const user = useAuthStore((s) => s.user)
  const vendor = useAuthStore((s) => s.vendor)
  const vendorBookings = useBookingsStore((s) => s.vendorBookings)
  const fetchVendorBookings = useBookingsStore((s) => s.fetchVendorBookings)
  const updateStatus = useBookingsStore((s) => s.updateStatus)
  // A pending job whose time passes while Home is open loses its Accept.
  const now = useNow(30_000)
  // After a refused action, re-read the list so the card shows what is true.
  const reload = () => fetchVendorBookings().catch(() => undefined)
  const [reviews, setReviews] = useState<Review[]>([])
  const [profile, setProfile] = useState<ApiVendorProfile | null>(null)
  const [weekEarnings, setWeekEarnings] = useState<number | null>(null)
  // Placeholders stand in for the job list until the first read settles, so
  // an empty list is never shown for a garage whose jobs are still loading.
  const [jobsLoaded, setJobsLoaded] = useState(false)
  // A failed read is not "No new bookings". Home has no poll, so saying that
  // on a patchy connection would leave paid requests waiting unseen until
  // someone reloaded; it says the read failed and offers Retry instead.
  const [jobsFailed, setJobsFailed] = useState(false)
  // The incoming card whose Reject was tapped, waiting on "Reject this
  // booking?". One tap used to decline a paid job outright.
  const [confirmRejectId, setConfirmRejectId] = useState<string | null>(null)
  const isVendorAdmin = useIsVendorAdmin()

  const isVerified = vendor?.isVerified ?? false
  // Only meaningful once the profile has loaded — `null` while loading must not
  // flash a "location missing" warning at a garage that has one.
  const needsLocation = profile !== null && profile.lat === null
  const paused = profile !== null && profile.bookingsPausedAt != null
  const pending = useMemo(
    () => vendorBookings.filter((b) => b.status === 'pending'),
    [vendorBookings]
  )
  const stats = useMemo(
    () => computeVendorDashboardStats(vendorBookings, reviews),
    [vendorBookings, reviews]
  )

  const loadJobs = useCallback(
    () =>
      fetchVendorBookings()
        .then(() => setJobsFailed(false))
        .catch(() => setJobsFailed(true))
        .finally(() => setJobsLoaded(true)),
    [fetchVendorBookings]
  )
  // Nothing to count from when the read failed and there is no earlier list.
  const jobsUnknown = jobsFailed && vendorBookings.length === 0

  useEffect(() => {
    if (!vendor?.id) return
    void Promise.all([
      loadJobs(),
      getVendorReviews(vendor.id).then(setReviews),
      // The session's vendor summary carries no coordinates, so the full
      // profile is needed to know whether the garage has been pinned.
      getMyVendor().then(setProfile).catch(() => undefined),
    ])
  }, [vendor?.id, loadJobs])

  // Money is a separate call now, and an operator's home page never makes it —
  // gating the Earnings tab alone would have left this tile on their landing
  // page, which is the easiest half of the boundary to miss.
  useEffect(() => {
    if (!vendor?.id || !isVendorAdmin) return
    void getEarningsData().then((data) => setWeekEarnings(data.weekEarnings))
  }, [vendor?.id, isVendorAdmin])

  return (
    <AppShell
      showNav
      navType="vendor"
      showBrand
      brandRight={<ActiveGarage />}
      className="gap-5 py-4"
    >
      <TopBar title={`${greetingFor(new Date(now))}, ${user?.name?.split(' ')[0] ?? 'there'}`} />

      {/* Ordered by what actually blocks the garage. An unpinned garage cannot
          be verified at all, so telling them "under review" first would be
          misleading — there is nothing to review until they act. Under review
          is a wait, not a problem, so it is the neutral notice, not amber. */}
      {needsLocation ? (
        <Notice href="/settings?tab=location" title="Set your garage location">
          Customers can&apos;t find you until your garage is on the map, and
          we can&apos;t verify you without it. Tap to pin it.
        </Notice>
      ) : (
        !isVerified && (
          <Notice tone="neutral" title="Your profile is under review">
            You&apos;ll be notified once verified.
          </Notice>
        )
      )}

      {/* A paused garage is invisible to customers, which is easy to forget
          a week later — so Home says so for as long as it lasts. Only an
          admin can resume (Settings is theirs), so only they get the link. */}
      {paused &&
        (isVendorAdmin ? (
          // Straight to the tab with the switch, not Settings' first tab.
          <Notice href="/settings?tab=time-off" title="New bookings are paused">
            Customers can&apos;t find or book you. Bookings you already have
            stay as they are. Tap to resume in Settings.
          </Notice>
        ) : (
          <Notice title="New bookings are paused">
            Customers can&apos;t find or book this garage. Bookings already
            made stay as they are.
          </Notice>
        ))}

      {/* New-booking alerts on this device, until they are on (0044). */}
      <PushBanner />

      <Reveal className="grid grid-cols-2 gap-2">
        <StatTile label="Today's jobs" value={jobsUnknown ? '–' : stats.todaysJobs} />
        <StatTile label="Pending requests" value={jobsUnknown ? '–' : stats.pendingRequests} />
        {isVendorAdmin && (
          <StatTile
            label="This week"
            // A dash until the figure arrives: a ₹0 that turns into ₹4,200 a
            // moment later reads as money that appeared.
            value={weekEarnings === null ? '–' : formatRupees(weekEarnings)}
          />
        )}
        {/* The way to the reviews behind the number. The label carries the
            figure itself: an aria-label replaces the tile's text, so leaving
            the rating out would hide the one thing the tile is for. */}
        <Link
          href="/reviews"
          aria-label={
            stats.reviewCount === 0
              ? 'Average rating: no reviews yet. See reviews'
              : `Average rating ${formatRating(stats.avgRating)} from ${reviewCountLabel(stats.reviewCount)}. See reviews`
          }
          className="press block"
        >
          <StatTile
            label="Avg rating"
            className="h-full"
            value={
              <span className="flex items-center gap-1.5">
                {formatRating(stats.avgRating)}
                {stats.reviewCount > 0 && <Stars rating={stats.avgRating} size={12} />}
              </span>
            }
            hint={reviewCountLabel(stats.reviewCount)}
          />
        </Link>
      </Reveal>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Incoming bookings"
          action={
            <Link
              href="/bookings"
              className="-my-2 flex min-h-11 items-center gap-0.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              See all
              <IconChevronRight size={16} aria-hidden="true" />
            </Link>
          }
        />
        <div className="flex flex-col gap-2">
          {!jobsLoaded && vendorBookings.length === 0 ? (
            <SkeletonList count={2} itemClassName="h-40" />
          ) : jobsUnknown ? (
            <ErrorState
              message="Couldn't load your bookings. Check your connection."
              onRetry={() => {
                setJobsLoaded(false)
                void loadJobs()
              }}
            />
          ) : pending.length === 0 ? (
            <EmptyState
              icon={<IconInbox size={28} stroke={1.5} />}
              title="No new bookings"
              subtitle="New requests from customers show up here for you to accept."
            />
          ) : (
            pending.slice(0, 3).map((b, i) => (
              <Reveal key={b.id} index={i}>
                <ScCard className="flex flex-col gap-3">
                  <JobCardHeader booking={b} />
                  <JobContact booking={b} />
                  {/* Past its time unaccepted: only declining is left (the
                      server refuses a late accept). */}
                  {new Date(b.scheduledAtIso).getTime() <= now && (
                    <p className="text-[12px] text-text-secondary">
                      This slot&apos;s time has passed without being accepted. Reject it so the
                      customer can be refunded.
                    </p>
                  )}
                  {confirmRejectId === b.id ? (
                    // The same inline confirm as the Bookings page: declining
                    // refunds a customer who has paid, so it takes two taps.
                    <div className="rise-in flex flex-col gap-2 border-t border-border pt-3">
                      <p className="text-[13px] font-medium text-text-primary">
                        Reject this booking?
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <ScButton variant="secondary" onClick={() => setConfirmRejectId(null)}>
                          Keep
                        </ScButton>
                        <ScButton
                          aria-label={`Confirm reject booking for ${b.customerName}`}
                          onClick={() => {
                            setConfirmRejectId(null)
                            updateStatus(b.id, 'cancelled').then(() => toast.success('Booking rejected')).catch((err) => { toast.error(err instanceof Error ? err.message : 'Failed to reject'); void reload() })
                          }}
                        >
                          Reject
                        </ScButton>
                      </div>
                    </div>
                  ) : (
                    // Accept is the card's one red; Reject is the quiet outline
                    // beside it.
                    <div className="grid grid-cols-2 gap-2">
                      <ScButton
                        variant="secondary"
                        aria-label={`Reject booking for ${b.customerName}`}
                        className={new Date(b.scheduledAtIso).getTime() <= now ? 'col-span-2' : undefined}
                        onClick={() => setConfirmRejectId(b.id)}
                      >
                        Reject
                      </ScButton>
                      {new Date(b.scheduledAtIso).getTime() > now && (
                        <ScButton
                          aria-label={`Accept booking for ${b.customerName}`}
                          onClick={() => updateStatus(b.id, 'confirmed').then(() => toast.success('Booking accepted')).catch((err) => { toast.error(err instanceof Error ? err.message : 'Failed to accept'); void reload() })}
                        >
                          Accept
                        </ScButton>
                      )}
                    </div>
                  )}
                </ScCard>
              </Reveal>
            ))
          )}
          {pending.length > 3 && (
            <Link
              href="/bookings"
              className="flex min-h-11 items-center justify-center rounded-[10px] border border-border text-[13px] font-medium text-text-primary transition-colors hover:bg-surface"
            >
              <span>
                See all <span className="font-numeric">{pending.length}</span> new bookings
              </span>
            </Link>
          )}
        </div>
      </section>

      {/* Detlio Certified (0048): where the garage stands against the
          standards, for the owner seat (the server refuses operators). After
          the jobs: it is something to work towards, not to act on now. */}
      {isVendorAdmin && <CertifiedCard key={vendor?.id} />}
    </AppShell>
  )
}
