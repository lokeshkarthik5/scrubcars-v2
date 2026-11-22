'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  IconChevronRight,
  IconInbox,
  IconMessage,
  IconStar,
  IconUser,
  IconWallet,
} from '@tabler/icons-react'
import { fill, useT, useTn } from '@repo/core/i18n'
import { AppShell } from '@repo/ui/sc/app-shell'
import { LoadError } from '@repo/ui/sc/load-error'
import { Notice } from '@repo/ui/sc/notice'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { apiClient } from '@repo/core/api/client'
import { getVendorReviews } from '@repo/core/api/reviews'
import { getMyVendor } from '@repo/core/api/vendors'
import type { ApiVendorProfile } from '@repo/core/api/types'
import { formatClock, formatINR } from '@repo/core/format'
import { useNow } from '@repo/core/hooks/use-now'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { useAuthStore } from '@repo/core/stores/auth-store'
import type { Review } from '@repo/core/types'
import { formatRating, greetingFor, reviewCountLabel } from '@repo/core/vendor-stats'
import { NEW_GARAGE_LABEL, isNewGarage } from '@repo/core/ratings'
import { GARAGE_NON_SOLICITATION_LINE } from '@repo/core/bypass-reports'
import { AgreementBanner } from '@/components/agreement-banner'
import { TierCard } from '@/components/tier-card'
import { GarageStatus } from '@/components/garage-status'
import { GuaranteeHomeCard } from '@/components/guarantee-home-card'
import { NewBookingCard } from '@/components/new-booking-card'
import { PushBanner } from '@/components/push-banner'
import {
  istDay,
  servicesLine,
  shortName,
  sortByUrgency,
  todayView,
  waitingSummary,
} from '@/lib/jobs'
import {
  BIG_FIGURE,
  HubList,
  HubPill,
  HubRow,
  HubTag,
  HubTile,
  SlimBar,
  TileRow,
} from '@/components/hub/parts'
import type { Booking } from '@repo/core/types'
import { useVendorBookings } from '@/lib/use-vendor-bookings'
import { useGarageRequestCount } from '@repo/core/api/hooks/use-booking-requests'
import {
  repairQuotesOn,
  useGarageRepairQuoteCount,
  useRepairQuotesConfig,
} from '@repo/core/api/hooks/use-repair-quotes'
import { REQUEST_RULES } from '@repo/core/booking-requests'
import { cn } from '@repo/core/utils'
import { BookHome } from '@/components/book/book-home'
import { useGarageBookOn } from '@/lib/garage-book'

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
  const t = useT()
  const vendor = useAuthStore((s) => s.vendor)
  const user = useAuthStore((s) => s.user)
  const { bookings, loaded, failed, retrying, reload } = useVendorBookings()
  const now = useNow(10_000)
  const [reviews, setReviews] = useState<Review[] | null>(null)
  const [reviewsFailed, setReviewsFailed] = useState(false)
  const [profile, setProfile] = useState<ApiVendorProfile | null>(null)
  const [week, setWeek] = useState<number | null>(null)
  const isVendorAdmin = useIsVendorAdmin()
  // Garage Book (0072): with it on, Home is the book's (B1), in the finish;
  // off, Home is exactly as it was.
  const book = useGarageBookOn().on

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
  const doneToday = useMemo(() => completedTodayCount(bookings, now), [bookings, now])
  const greetName = firstNameOf(user?.name)
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
      className={cn('gap-3 py-4', book && 'finish gap-4')}
    >
      <h1 className="sr-only">{t('Home')}</h1>
      {/* The hello, by Chennai's hour, with the signed-in person's first
          name; left out while no name is known. */}
      {!book && greetName && (
        <p className="px-1 pt-1 text-[24px] leading-[1.25] font-semibold tracking-[-0.02em] text-text-primary">
          {`${greetingFor(new Date(now))}, ${greetName}`}
        </p>
      )}

      {/* Ordered by what actually blocks the garage. An unpinned garage cannot
          be shown to customers at all, so telling them "under review" first
          would be misleading — there is nothing to review until they act. */}
      {needsLocation ? (
        <Notice href="/settings?section=location" title={t('Set your garage location')}>
          {t(
            "Customers can't find you until your garage is on the map, and we can't show you to customers without it. Tap to pin it."
          )}
        </Notice>
      ) : (
        !isVerified && (
          <Notice tone="neutral" title={t('Not shown to customers yet')}>
            {t("Detlio is checking your garage. You'll be told once customers can find you.")}
          </Notice>
        )
      )}

      {/* The garage agreement (0063): a version to accept, owner seat only. */}
      {isVendorAdmin && <AgreementBanner vendorId={vendor?.id} />}

      {/* A paused garage is invisible to customers, which is easy to forget a
          week later. Only an admin can resume (Settings is theirs). */}
      {paused &&
        (isVendorAdmin ? (
          <Notice href="/settings?section=time-off" title={t('New bookings are paused')}>
            {t(
              "Customers can't find or book you. Bookings you already have stay as they are. Tap to resume in Settings."
            )}
          </Notice>
        ) : (
          <Notice title={t('New bookings are paused')}>
            {t(
              "Customers can't find or book this garage. Bookings already made stay as they are."
            )}
          </Notice>
        ))}

      <PushBanner />

      {book ? (
        <>
          <Suspense fallback={null}>
            <BookHome pending={pending} now={now} onChanged={reload} />
          </Suspense>
          <RequestsHomeCard />
        </>
      ) : (
        <>
          <TodayCard
            unknown={jobsUnknown}
            loading={!loaded && bookings.length === 0}
            working={today.working.length}
            next={today.next}
            doneToday={doneToday}
          />

          <section aria-labelledby="home-waiting" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 px-1 pt-1">
              <h2
                id="home-waiting"
                className="flex items-center gap-2 text-[16px] font-medium text-text-primary"
              >
                {t('Waiting for your answer')}
                {waiting.count > 0 && (
                  <span className="inline-flex min-w-[22px] items-center justify-center rounded-full bg-brand-red-fill px-1.5 font-numeric text-[12px] font-semibold leading-[22px] text-brand-white">
                    {waiting.count}
                  </span>
                )}
              </h2>
              <Link
                href="/bookings?tab=new"
                className="-my-2 flex min-h-12 shrink-0 items-center gap-0.5 text-t4 text-text-secondary transition-colors hover:text-text-primary"
              >
                {t('See all')}
                <IconChevronRight size={16} aria-hidden="true" />
              </Link>
            </div>

            {!loaded && bookings.length === 0 ? (
              <SkeletonList count={2} itemClassName="h-64 rounded-[28px]" />
            ) : jobsUnknown ? (
              <LoadError
                what={t('your bookings')}
                onRetry={reload}
                retrying={retrying}
              />
            ) : pending.length === 0 ? (
              <p className="hub-card flex items-center gap-3 px-5 py-4 text-t3 text-text-secondary">
                <IconInbox size={22} aria-hidden="true" className="shrink-0" />
                {t('No new bookings. They show here the moment a customer pays.')}
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
                  <HubPill href="/bookings?tab=new">
                    {fill(t('See all {count} new bookings'), {
                      count: <span className="mx-1 font-numeric">{pending.length}</span>,
                    })}
                  </HubPill>
                )}
              </>
            )}
          </section>

          <TileRow>
            {isVendorAdmin && (
              <HubTile
                href="/earnings"
                label={t('This week')}
                icon={IconWallet}
                ariaLabel={
                  week === null
                    ? t('This week: not loaded. Open Earnings')
                    : t('This week: {amount}. Open Earnings', { amount: formatINR(week) })
                }
                // A dash, never ₹0, until the figure arrives (or when it fails).
                value={week === null ? '–' : formatINR(week)}
                line={`${t('Earnings')} ›`}
              />
            )}
            {/* The label carries the figure itself: an aria-label replaces the
                tile's text, so leaving the rating out would hide what it is for. */}
            <HubTile
              href="/reviews"
              label={t('Avg rating')}
              icon={IconStar}
              className={cn(!isVendorAdmin && 'col-span-2')}
              ariaLabel={
                reviews === null
                  ? t('Average rating: not loaded. See reviews')
                  : reviewCount === 0
                    ? t('Average rating: no reviews yet. See reviews')
                    : newGarage
                      ? t('Average rating: {label}, {reviews}. See reviews', {
                          label: t(NEW_GARAGE_LABEL),
                          reviews: reviewCountLabel(reviewCount),
                        })
                      : t('Average rating {rating} from {reviews}. See reviews', {
                          rating: formatRating(avgRating),
                          reviews: reviewCountLabel(reviewCount),
                        })
              }
              value={
                reviews === null ? (
                  '–'
                ) : reviewCount > 0 && newGarage ? (
                  <span className="text-[18px] font-normal tracking-normal">{t(NEW_GARAGE_LABEL)}</span>
                ) : (
                  formatRating(avgRating)
                )
              }
              line={
                reviewsFailed
                  ? t("Couldn't load")
                  : reviews === null
                    ? undefined
                    : `${reviewCountLabel(reviewCount)} ›`
              }
            />
          </TileRow>

          {/* Requests (while any wait) and Your account, in one list card.
              Every seat has Your account (0066): an operator has no Settings
              tab, so this is their way there. */}
          <HubList>
            <RequestsHomeRow />
            <HubRow href="/account" icon={IconUser} label={t('Your account')} />
          </HubList>
        </>
      )}

      {/* Free redo claims (0051): what waits for an answer, owner seat only. */}
      {isVendorAdmin && <GuaranteeHomeCard key={`guarantee-${vendor?.id}`} />}

      {/* Your tier (0063): Bronze, Silver or Gold and the next tier's steps,
          something to work towards; owner seat only. */}
      {isVendorAdmin && <TierCard vendorId={vendor?.id} />}

      {/* Every seat's account (0066): leave the garage, delete the login, log
          out. An operator has no Settings tab, so this is their way there. */}
      {book && (
      <Link
        href="/account"
        className="press flex min-h-12 items-center justify-between rounded-[16px] border border-border bg-surface px-4 py-2 text-[15px] text-text-primary"
      >
        {t('Your account')}
        <IconChevronRight size={18} aria-hidden="true" className="shrink-0 text-text-muted" />
      </Link>
      )}

      {/* The agreement's non-solicitation term (0052): a reminder for every seat. */}
      <p className="px-1 text-[13px] text-text-secondary">
        {t(GARAGE_NON_SOLICITATION_LINE)}
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
  const t = useT()
  const tn = useTn()
  const count = useGarageRequestCount()
  // Repair quotes (0075) wait in the same list, so they count here too.
  const repairOn = repairQuotesOn(useRepairQuotesConfig().data)
  const repairCount = useGarageRepairQuoteCount(repairOn)
  const repairs = repairOn ? (repairCount.data?.waiting ?? 0) : 0
  const waiting = (count.data?.waiting ?? 0) + repairs
  if (waiting <= 0) return null
  return (
    <Link
      href="/requests"
      className="press flex min-h-14 items-center gap-3 rounded-[20px] border border-warning/40 bg-surface px-4 py-3"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
          {t('Requests')}
          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-brand-red-fill px-1.5 font-numeric text-[13px] font-semibold leading-6 text-brand-white">
            {waiting}
          </span>
        </span>
        <span className="block text-[13px] text-text-secondary">
          {repairs > 0
            ? tn(waiting, '{count} request waiting', '{count} requests waiting')
            : tn(
                waiting,
                '{count} request waiting · answer within {hours} h',
                '{count} requests waiting · answer within {hours} h',
                { hours: REQUEST_RULES.respondMinutes / 60 }
              )}
        </span>
      </span>
      <IconChevronRight size={18} aria-hidden="true" className="shrink-0" />
    </Link>
  )
}

/** The first word of a name, or null when there is none to greet. */
function firstNameOf(name: string | undefined | null): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0]
  return first ? first : null
}

/** Jobs finished today (India's calendar): the done part of the Today bar. */
function completedTodayCount(bookings: readonly Booking[], now: number): number {
  const today = istDay(now)
  return bookings.filter(
    (b) =>
      b.status === 'completed' &&
      b.completedAtIso != null &&
      istDay(new Date(b.completedAtIso).getTime()) === today
  ).length
}

/**
 * Today, the Home's hero card (mockup garage-hub 1): the jobs still on today
 * (under way and next) as one big light number, how many are under way, a
 * slim bar of done against the day, and the next job. The whole card opens
 * Bookings › Today, under the name the Today tile had.
 */
function TodayCard({
  unknown,
  loading,
  working,
  next,
  doneToday,
}: {
  unknown: boolean
  loading: boolean
  working: number
  next: Booking[]
  doneToday: number
}) {
  const t = useT()
  const tn = useTn()
  const count = working + next.length
  const first = next[0]
  const total = count + doneToday
  return (
    <Link
      href="/bookings?tab=today"
      aria-label={
        unknown
          ? t("Today's jobs: unknown. Open Today")
          : t("Today's jobs: {count}. Open Today", { count })
      }
      className="hub-card press flex flex-col gap-3 px-5 pt-4 pb-5"
    >
      <span className="text-t4 text-dim">{t('Today')}</span>
      <span className="flex items-end justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className={cn(BIG_FIGURE, 'text-[56px] tracking-[-0.04em]')}>
            {unknown || loading ? '–' : count}
          </span>
          {!unknown && !loading && (
            <span className="text-[16px] text-dim">{tn(count, 'job', 'jobs')}</span>
          )}
        </span>
        {working > 0 && (
          <HubTag tone="green" dot className="mb-1">
            {t('{count} under way', { count: working })}
          </HubTag>
        )}
      </span>
      {!unknown && !loading && total > 0 && (
        <SlimBar value={doneToday / total} label={t('Done')} />
      )}
      {first && (
        <span className="truncate text-t4 text-text-secondary">
          {t('Next: {time} · {who} · {what}', {
            time: formatClock(first.scheduledAtIso),
            who: shortName(first.customerName),
            what: servicesLine(first),
          })}
        </span>
      )}
    </Link>
  )
}

/**
 * Requests (0062) and repair quotes (0075) waiting for an answer, as a row of
 * Home's list card: the count and the way in. Nothing while none wait, or
 * when the count can't be read, as the card it replaces.
 */
function RequestsHomeRow() {
  const t = useT()
  const tn = useTn()
  const count = useGarageRequestCount()
  const repairOn = repairQuotesOn(useRepairQuotesConfig().data)
  const repairCount = useGarageRepairQuoteCount(repairOn)
  const repairs = repairOn ? (repairCount.data?.waiting ?? 0) : 0
  const waiting = (count.data?.waiting ?? 0) + repairs
  if (waiting <= 0) return null
  return (
    <HubRow
      href="/requests"
      icon={IconMessage}
      label={
        <span className="flex items-center gap-2">
          {t('Requests')}
          <span className="inline-flex min-w-[22px] items-center justify-center rounded-full bg-brand-red-fill px-1.5 font-numeric text-[12px] font-semibold leading-[22px] text-brand-white">
            {waiting}
          </span>
        </span>
      }
      sub={
        repairs > 0
          ? tn(waiting, '{count} request waiting', '{count} requests waiting')
          : tn(
              waiting,
              '{count} request waiting · answer within {hours} h',
              '{count} requests waiting · answer within {hours} h',
              { hours: REQUEST_RULES.respondMinutes / 60 }
            )
      }
    />
  )
}
