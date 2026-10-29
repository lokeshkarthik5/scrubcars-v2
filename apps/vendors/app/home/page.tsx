'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { IconChevronRight, IconInbox } from '@tabler/icons-react'
import { AppShell } from '@repo/ui/sc/app-shell'
import { LoadError } from '@repo/ui/sc/load-error'
import { Notice } from '@repo/ui/sc/notice'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { StatTile } from '@repo/ui/sc/stat-tile'
import { Stars } from '@repo/ui/sc/stars'
import { apiClient } from '@repo/core/api/client'
import { getVendorReviews } from '@repo/core/api/reviews'
import { getMyVendor } from '@repo/core/api/vendors'
import type { ApiVendorProfile } from '@repo/core/api/types'
import { formatINR } from '@repo/core/format'
import { useNow } from '@repo/core/hooks/use-now'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { useAuthStore } from '@repo/core/stores/auth-store'
import type { Review } from '@repo/core/types'
import { formatRating, reviewCountLabel } from '@repo/core/vendor-stats'
import { NEW_GARAGE_LABEL, isNewGarage } from '@repo/core/ratings'
import { GARAGE_NON_SOLICITATION_LINE } from '@repo/core/bypass-reports'
import { AgreementBanner } from '@/components/agreement-banner'
import { TierCard } from '@/components/tier-card'
import { GarageStatus } from '@/components/garage-status'
import { GuaranteeHomeCard } from '@/components/guarantee-home-card'
import { NewBookingCard } from '@/components/new-booking-card'
import { PushBanner } from '@/components/push-banner'
import { sortByUrgency, todayView, waitingSummary } from '@/lib/jobs'
import { useVendorBookings } from '@/lib/use-vendor-bookings'
import { useGarageRequestCount } from '@repo/core/api/hooks/use-booking-requests'
import { REQUEST_RULES } from '@repo/core/booking-requests'

/** How many new-booking cards Home shows before "See all". */
const CARDS_ON_HOME = 3

/**
 * This week's earnings for the tile. Read here rather than through
 * getEarningsData, which answers a failed call with zeros: a ₹0 for a
 * failed load reads as no money (UX audit, garage finding 4).
 */
async function weekEarnings(): Promise<number> {
  const data = await apiClient<{ weekEarnings: number }>(
    '/vendors/me/earnings',
    { params: { period: 'week' } }
  )
  return Number(data.weekEarnings)
}

/**
 * Home, where the garage lands and where the phone sits open (UX audit,
 * garage findings 1, 3, 4, 8 and 9; mockup 01). New bookings come first, on
 * the same card as Bookings › New, most urgent first with the time left to
 * answer on top, re-read every 10 seconds. Then the day in numbers, each
 * tile a way into its list.
 */
export default function VendorHomePage() {
  const vendor = useAuthStore((s) => s.vendor)
  const { bookings, loaded, failed, retrying, reload } = useVendorBookings()
  const now = useNow(10_000)
  const [reviews, setReviews] = useState<Review[] | null>(null)
  const [reviewsFailed, setReviewsFailed] = useState(false)
  const [profile, setProfile] = useState<ApiVendorProfile | null>(null)
  const [week, setWeek] = useState<number | null>(null)
  const isVendorAdmin = useIsVendorAdmin()

  const isVerified = vendor?.isVerified ?? false
  // Only meaningful once the profile has loaded — `null` while loading must not
  // flash a "location missing" warning at a garage that has one.
  const needsLocation = profile !== null && profile.lat === null
  const paused = profile !== null && profile.bookingsPausedAt != null

  const pending = useMemo(
    () =>
      sortByUrgency(
        bookings.filter((b) => b.status === 'pending'),
        now
      ),
    [bookings, now]
  )
  const waiting = useMemo(() => waitingSummary(pending, now), [pending, now])
  const today = useMemo(() => todayView(bookings, now), [bookings, now])
  // Nothing to count from when the read failed and there is no earlier list.
  const jobsUnknown = failed && bookings.length === 0

  useEffect(() => {
    if (!vendor?.id) return
    getVendorReviews(vendor.id)
      .then((list) => {
        setReviews(list)
        setReviewsFailed(false)
      })
      .catch(() => setReviewsFailed(true))
    // The session's vendor summary carries no coordinates, so the full
    // profile is needed to know whether the garage has been pinned.
    getMyVendor()
      .then(setProfile)
      .catch(() => undefined)
  }, [vendor?.id])

  // Money is a separate call, and an operator's home page never makes it.
  useEffect(() => {
    if (!vendor?.id || !isVendorAdmin) return
    weekEarnings()
      .then(setWeek)
      .catch(() => setWeek(null))
  }, [vendor?.id, isVendorAdmin])

  // The list is counted reviews only (0065: no Test booking's, none hidden),
  // and fewer than 3 is a new garage, with no score: the customers' rule.
  const reviewCount = reviews?.length ?? 0
  const newGarage = isNewGarage(reviewCount)
  const avgRating =
    reviewCount > 0
      ? reviews!.reduce((sum, r) => sum + r.rating, 0) / reviewCount
      : 0

  return (
    <AppShell
      showNav
      navType="vendor"
      showBrand
      brandRight={<GarageStatus />}
      className="gap-5 py-4"
    >
      <h1 className="sr-only">Home</h1>

      {/* Ordered by what actually blocks the garage. An unpinned garage cannot
          be shown to customers at all, so telling them "under review" first
          would be misleading — there is nothing to review until they act. */}
      {needsLocation ? (
        <Notice href="/settings?tab=location" title="Set your garage location">
          Customers can&apos;t find you until your garage is on the map, and we
          can&apos;t show you to customers without it. Tap to pin it.
        </Notice>
      ) : (
        !isVerified && (
          <Notice tone="neutral" title="Not shown to customers yet">
            Detlio is checking your garage. You&apos;ll be told once customers can find you.
          </Notice>
        )
      )}

      {/* The garage agreement (0063): a version to accept, owner seat only. */}
      {isVendorAdmin && <AgreementBanner vendorId={vendor?.id} />}

      {/* A paused garage is invisible to customers, which is easy to forget a
          week later. Only an admin can resume (Settings is theirs). */}
      {paused &&
        (isVendorAdmin ? (
          <Notice href="/settings?tab=time-off" title="New bookings are paused">
            Customers can&apos;t find or book you. Bookings you already have
            stay as they are. Tap to resume in Settings.
          </Notice>
        ) : (
          <Notice title="New bookings are paused">
            Customers can&apos;t find or book this garage. Bookings already made
            stay as they are.
          </Notice>
        ))}

      <PushBanner />

      <section aria-labelledby="home-waiting" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2
            id="home-waiting"
            className="flex items-center gap-2 text-[18px] font-semibold text-text-primary"
          >
            Waiting for your answer
            {waiting.count > 0 && (
              <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-brand-red-fill px-1.5 font-numeric text-[13px] font-semibold leading-6 text-brand-white">
                {waiting.count}
              </span>
            )}
          </h2>
          <Link
            href="/bookings?tab=new"
            className="-my-2 flex min-h-12 items-center gap-0.5 text-[15px] font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            See all
            <IconChevronRight size={18} aria-hidden="true" />
          </Link>
        </div>

        {!loaded && bookings.length === 0 ? (
          <SkeletonList count={2} itemClassName="h-64" />
        ) : jobsUnknown ? (
          <LoadError
            what="your bookings"
            onRetry={reload}
            retrying={retrying}
          />
        ) : pending.length === 0 ? (
          <p className="flex items-center gap-3 rounded-[20px] border border-border bg-surface px-4 py-4 text-[15px] text-text-secondary">
            <IconInbox size={22} aria-hidden="true" className="shrink-0" />
            No new bookings. They show here the moment a customer pays.
          </p>
        ) : (
          <>
            {pending.slice(0, CARDS_ON_HOME).map((b) => (
              <NewBookingCard
                key={b.id}
                booking={b}
                now={now}
                onChanged={reload}
              />
            ))}
            {pending.length > CARDS_ON_HOME && (
              <Link
                href="/bookings?tab=new"
                className="flex min-h-12 items-center justify-center rounded-full border border-white/20 text-[15px] font-medium text-text-primary transition-colors hover:bg-surface"
              >
                See all{' '}
                <span className="mx-1 font-numeric">{pending.length}</span> new
                bookings
              </Link>
            )}
          </>
        )}
      </section>

      <RequestsHomeCard />

      <div className="grid grid-cols-2 gap-2">
        {/* Each tile opens what it counts (finding 9: Today's jobs couldn't be tapped). */}
        <Link
          href="/bookings?tab=today"
          aria-label={
            jobsUnknown
              ? "Today's jobs: unknown. Open Today"
              : `Today's jobs: ${today.working.length + today.next.length}. Open Today`
          }
          className="press block"
        >
          <StatTile
            label="Today's jobs"
            className="h-full"
            value={jobsUnknown ? '–' : today.working.length + today.next.length}
            hint={
              today.working.length > 0
                ? `${today.working.length} under way`
                : undefined
            }
          />
        </Link>
        {isVendorAdmin && (
          <Link
            href="/earnings"
            className="press block"
            aria-label={`This week: ${week === null ? 'not loaded' : formatINR(week)}. Open Earnings`}
          >
            {/* A dash, never ₹0, until the figure arrives (or when it fails). */}
            <StatTile
              label="This week"
              className="h-full"
              value={week === null ? '–' : formatINR(week)}
            />
          </Link>
        )}
        {/* The label carries the figure itself: an aria-label replaces the
            tile's text, so leaving the rating out would hide what it is for. */}
        <Link
          href="/reviews"
          aria-label={
            reviews === null
              ? 'Average rating: not loaded. See reviews'
              : reviewCount === 0
                ? 'Average rating: no reviews yet. See reviews'
                : newGarage
                  ? `Average rating: ${NEW_GARAGE_LABEL}, ${reviewCountLabel(reviewCount)}. See reviews`
                  : `Average rating ${formatRating(avgRating)} from ${reviewCountLabel(reviewCount)}. See reviews`
          }
          className="press block"
        >
          <StatTile
            label="Avg rating"
            className="h-full"
            value={
              reviews === null ? (
                '–'
              ) : reviewCount > 0 && newGarage ? (
                <span className="text-[15px]">{NEW_GARAGE_LABEL}</span>
              ) : (
                <span className="flex items-center gap-1.5">
                  {formatRating(avgRating)}
                  {reviewCount > 0 && <Stars rating={avgRating} size={12} />}
                </span>
              )
            }
            hint={
              reviewsFailed
                ? "Couldn't load"
                : reviews === null
                  ? undefined
                  : reviewCountLabel(reviewCount)
            }
          />
        </Link>
      </div>

      {/* Free redo claims (0051): what waits for an answer, owner seat only. */}
      {isVendorAdmin && <GuaranteeHomeCard key={`guarantee-${vendor?.id}`} />}

      {/* Your tier (0063): Bronze, Silver or Gold and the next tier's steps,
          something to work towards; owner seat only. */}
      {isVendorAdmin && <TierCard vendorId={vendor?.id} />}

      {/* The agreement's non-solicitation term (0052): a reminder for every seat. */}
      <p className="px-1 text-[13px] text-text-secondary">
        {GARAGE_NON_SOLICITATION_LINE}
      </p>
    </AppShell>
  )
}

/**
 * Requests from customers just outside the garage's reach (0062), waiting
 * for an answer: a count and the way in. Nothing while none wait, or when
 * the count can't be read (an API without the route yet).
 */
function RequestsHomeCard() {
  const count = useGarageRequestCount()
  const waiting = count.data?.waiting ?? 0
  if (waiting <= 0) return null
  return (
    <Link
      href="/requests"
      className="press flex min-h-14 items-center gap-3 rounded-[20px] border border-warning/40 bg-surface px-4 py-3"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
          Requests
          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-brand-red-fill px-1.5 font-numeric text-[13px] font-semibold leading-6 text-brand-white">
            {waiting}
          </span>
        </span>
        <span className="block text-[13px] text-text-secondary">
          {waiting} {waiting === 1 ? 'request' : 'requests'} waiting · answer
          within {REQUEST_RULES.respondMinutes / 60} h
        </span>
      </span>
      <IconChevronRight size={18} aria-hidden="true" className="shrink-0" />
    </Link>
  )
}
