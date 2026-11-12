'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconArrowUpRight, IconRepeat } from '@tabler/icons-react'
import { CustomerShell } from '@/components/customer-shell'
import { isHomeHubEnabled } from '@/lib/home-hub'
import { StatusChip } from '@repo/ui/sc/status-chip'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@/components/ui/card'
import { Reveal } from '@repo/ui/sc/reveal'
import { EmptyState, ErrorState, SkeletonCard } from '@repo/ui/sc/empty-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/sc/tabs'
import { TopBar } from '@repo/ui/sc/top-bar'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import { formatClock, formatDay, formatWhen } from '@repo/core/format'
import { countdownBox, countdownParts, countdownWords } from '@repo/core/moments'
import { useQuery } from '@tanstack/react-query'
import { homeKeys } from '@repo/core/api/hooks/use-home'
import { getUpdates } from '@repo/core/api/home'
import { useNow } from '@repo/core/hooks/use-now'
import {
  actionsByBooking,
  STATUS_STEPS,
  answersByLine,
  bookingHeadline,
  customerStatusChip,
} from '@/lib/booking-status'
import { ProgressRoad, statusStops } from '@/components/moments/road'
import { PullToRefresh } from '@/components/moments/pull-to-refresh'
import { money } from '@/lib/money'
import { bookAgainPath, matchSavedAddress } from '@repo/core/book-again'
import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types'
import { PICKUP_STAGE_NOW, pickupStageOf, pickupTimeline } from '@repo/core/pickup'
import { useUserStore } from '@repo/core/stores/user-store'
import {
  DEFAULT_BOOKING_LIST_TAB,
  parseBookingListTab,
  splitBookingList,
  type BookingListTab,
} from '@repo/core/my-bookings'
import { cn } from '@repo/core/utils'
import { customerBookingInspectionPrice, customerSeesPaid } from '@repo/core/inspection-booking'
import type { Address, Booking } from '@repo/core/types'
import { useT } from '@repo/core/i18n'
import { t } from '@repo/core/i18n/translate'

/**
 * "Pickup & drop · Car collected": a pickup job's card says the mode, and
 * where the car is while it is away. Null for the other modes, whose cards
 * are unchanged.
 */
function pickupLine(booking: Booking): string | null {
  if (booking.bookingType !== 'pickup') return null
  const live = ['pending', 'confirmed', 'in_progress'].includes(booking.status)
  const stage = live
    ? pickupStageOf({
        status: booking.status,
        pickedUpAt: booking.pickup?.pickedUpAtIso,
        atGarageAt: booking.pickup?.atGarageAtIso,
        startedAt: booking.startedAtIso,
        outForDeliveryAt: booking.pickup?.outForDeliveryAtIso,
        deliveredAt: booking.pickup?.deliveredAtIso,
      })
    : 'booked'
  return stage === 'booked'
    ? t(BOOKING_TYPE_LABELS.pickup)
    : `${t(BOOKING_TYPE_LABELS.pickup)} · ${t(PICKUP_STAGE_NOW[stage])}`
}

/**
 * The card's own link, stretched over the whole card by its ::after (the card
 * is `relative`), so a tap anywhere opens the booking — as when the whole card
 * was a <Link>. That made "Book again" impossible: a link inside a link is
 * one target that announces as two. Now the card's link and Book again are
 * siblings, and Book again sits above the stretched layer. The overlay also
 * carries the keyboard focus ring, so focus outlines the whole card.
 */
const CARD_LINK = cn(
  'focus-visible:outline-none',
  "after:absolute after:-inset-px after:rounded-[22px] after:content-['']",
  'focus-visible:after:ring-2 focus-visible:after:ring-text-primary/70'
)

/** What every card of the list says about a booking, worked out once. */
function cardFacts(booking: Booking, action: string | null, now: number) {
  const chip = customerStatusChip(booking.status)
  const refunded =
    booking.status === 'cancelled' && booking.refund.status === 'refunded'
  const unpaid =
    booking.paymentMethod === 'online' &&
    booking.paymentStatus === 'pending' &&
    booking.status === 'pending'
  const needs = action ?? (unpaid ? t('Pay to hold your slot') : null)
  const waitingUntil =
    !needs &&
    booking.status === 'pending' &&
    booking.responseDeadline &&
    Date.parse(booking.responseDeadline.respondBy) > now
      ? answersByLine(booking.responseDeadline.respondBy, now)
      : null
  // The card's words, said once: the service is the visible text, and the
  // rest of the card sits outside the link.
  const label = [
    t('{service} at {garage}', { service: booking.serviceSummary, garage: booking.vendorName }),
    chip.label,
    refunded ? t('Refunded') : null,
    needs,
    booking.scheduledAt,
  ]
    .filter(Boolean)
    .join(', ')
  return { chip, refunded, needs, waitingUntil, label }
}

/** What it needs from the customer, with the small red light; else the quiet line. */
function NeedsLine({
  needs,
  quiet,
}: {
  needs: string | null
  quiet: string | null
}) {
  return needs ? (
    <span className="flex min-w-0 items-center gap-1.5 text-text-primary">
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full bg-[var(--color-red-light)] shadow-[0_0_6px_rgb(255_45_74/0.9)]"
      />
      {needs}
    </span>
  ) : (
    <span className="min-w-0 text-dim">{quiet ?? ''}</span>
  )
}

/**
 * The ticket card (moment 5): the next booking at the top of Upcoming, as a
 * ticket with notched edges, a live countdown in days, hours and minutes,
 * and the small road for where it stands. The same link, words and actions
 * as every booking card; only the look is a ticket's.
 */
function TicketCard({
  booking,
  action,
  now,
}: {
  booking: Booking
  action: string | null
  now: number
}) {
  const t = useT()
  const { chip, needs, waitingUntil, label } = cardFacts(booking, action, now)
  const headline = bookingHeadline(booking, now)
  const pickup = booking.bookingType === 'pickup' ? pickupTimeline(booking) : null
  const stops =
    headline.step === null
      ? null
      : pickup
        ? pickup.map((step) => ({ label: step.label, state: step.state }))
        : statusStops(STATUS_STEPS, headline.step, booking.status === 'completed')
  const parts = countdownParts(Date.parse(booking.scheduledAtIso), now)
  const boxes: Array<[number, 'days' | 'hours' | 'minutes', string]> = [
    [parts.days, 'days', 'days'],
    [parts.hours, 'hours', 'hours'],
    [parts.minutes, 'minutes', 'min'],
  ]
  return (
    <div
      className={cn(
        'mo-ticket fx-edge relative flex flex-col rounded-[22px] px-4 pb-[18px] pt-4',
        needs && 'border-brand-red/70'
      )}
      style={{ '--notch': '58%' } as React.CSSProperties}
    >
      <p className="text-over font-semibold uppercase text-[#8E8E98]">{t('Next booking')}</p>
      <p className="mt-1.5 text-t2 font-semibold text-text-primary">
        {t(formatDay(booking.scheduledAtIso, now))} ·{' '}
        <span className="font-numeric">{formatClock(booking.scheduledAtIso)}</span>
      </p>
      {/* Read as one line; the boxes are drawn. */}
      <p className="sr-only">{t('Starts in {countdownWords}', { countdownWords: countdownWords(parts) })}</p>
      <div aria-hidden="true" className="mt-3 flex gap-1.5">
        {boxes.map(([value, unit, word]) => (
          <span key={unit} className="fx-recessed min-w-[52px] rounded-[12px] py-2 text-center">
            <b className="block font-numeric text-[20px] font-semibold leading-none text-text-primary">
              {countdownBox(value, unit)}
            </b>
            <small className="text-over font-medium normal-case tracking-normal text-[#8E8E98]">{word}</small>
          </span>
        ))}
      </div>
      <div aria-hidden="true" className="mo-ticket__perf -mx-4 mb-3.5 mt-4" />
      <div className="flex items-start justify-between gap-3 text-t4 text-[#A8A8B2]">
        <p className="min-w-0">
          <b className="font-semibold text-text-primary">{booking.vendorName}</b>
          {' · '}
          <Link href={`/bookings/${booking.id}`} aria-label={label} className={CARD_LINK}>
            {booking.serviceSummary}
          </Link>
        </p>
        <StatusChip tone={chip.tone} dot={false}>
          {chip.label}
        </StatusChip>
      </div>
      {/* The car, and where it is while a pickup job has it, as every
          card says. */}
      {(booking.vehicle?.model || pickupLine(booking)) && (
        <p className="mt-1 text-t5 font-medium text-dim">
          {[booking.vehicle?.model, pickupLine(booking)].filter(Boolean).join(' · ')}
        </p>
      )}
      {stops && <ProgressRoad stops={stops} compact className="mb-1.5 mt-5" label={t('Where it stands')} />}
      <div className="mt-2 text-t4">
        <NeedsLine
          needs={needs}
          quiet={
            waitingUntil ??
            (customerSeesPaid(booking) ? t('Paid') : null)
          }
        />
      </div>
    </div>
  )
}

/**
 * A past booking in the compact list (moment 5): its service (the link),
 * the day and the garage, what it cost and how it ended, and Book again.
 */
function PastRow({
  booking,
  addresses,
  now,
}: {
  booking: Booking
  addresses: Address[]
  now: number
}) {
  const t = useT()
  const { chip, refunded, label } = cardFacts(booking, null, now)
  const inspection = customerBookingInspectionPrice(booking, money)
  return (
    <div className="relative flex flex-col gap-1 rounded-[16px] border border-white/[0.06] bg-[#111114] py-3 pl-3.5 pr-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-t4 font-semibold text-text-primary">
          <Link href={`/bookings/${booking.id}`} aria-label={label} className={COMPACT_LINK}>
            {booking.serviceSummary}
          </Link>
        </p>
        <span className="flex shrink-0 items-center gap-1.5">
          {refunded && (
            <StatusChip tone="done" dot={false}>
              {t('Refunded')}
            </StatusChip>
          )}
          <StatusChip tone={chip.tone} dot={false}>
            {chip.label}
          </StatusChip>
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-t5 font-medium text-[#8E8E98]">
        <span className="min-w-0 truncate">
          {[formatWhen(booking.scheduledAtIso, now), booking.vendorName].join(' · ')}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {inspection ? (
            // A no-fee inspection (0073): never ₹0, the bill once it comes.
            <span className={cn('text-t4 font-semibold text-text-primary', inspection.amount !== null && 'font-numeric')}>
              {inspection.text}
            </span>
          ) : (
            <>
              {booking.discountAmount > 0 && (
                <s className="font-numeric text-text-muted">{money(booking.subtotalPrice)}</s>
              )}
              <span className="font-numeric text-t4 font-semibold text-text-primary">
                {money(booking.servicePrice)}
              </span>
            </>
          )}
        </span>
      </div>
      {/* Quiet text, not a button, 44px tall to the thumb while drawn
          small. The name starts with the words on screen, so "tap Book
          again" in voice control finds it. */}
      <div className="-mb-2 flex justify-end">
        <Link
          href={bookAgainPath(booking, matchSavedAddress(booking, addresses))}
          aria-label={t('Book again: {serviceSummary} at {vendorName}', { serviceSummary: booking.serviceSummary, vendorName: booking.vendorName })}
          className="relative z-10 -mr-1 inline-flex min-h-11 items-center gap-1.5 rounded-[8px] px-2 text-t5 font-semibold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary/70"
        >
          <IconRepeat size={14} aria-hidden="true" />
          {t('Book again')}
        </Link>
      </div>
    </div>
  )
}

/** The compact row's own stretched link, with its smaller corners. */
const COMPACT_LINK = cn(
  'focus-visible:outline-none',
  "after:absolute after:-inset-px after:rounded-[16px] after:content-['']",
  'focus-visible:after:ring-2 focus-visible:after:ring-text-primary/70'
)

function BookingCard({
  booking,
  tab,
  addresses,
  action,
  now,
}: {
  booking: Booking
  tab: BookingListTab
  /** For Book again's address on a doorstep or pickup & drop booking. */
  addresses: Address[]
  /** What it needs from the customer, in words (F3), if anything. */
  action: string | null
  now: number
}) {
  const t = useT()
  const { chip, refunded, needs, waitingUntil, label } = cardFacts(booking, action, now)
  const pickup = pickupLine(booking)
  const inspection = customerBookingInspectionPrice(booking, money)

  return (
    // A booking that needs an answer gets a red hairline and says what (F3).
    <ScCard
      className={cn(
        'press relative flex flex-col gap-1.5 p-5',
        needs && 'border-brand-red/70'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-t2 leading-snug text-text-primary">
          <Link
            href={`/bookings/${booking.id}`}
            // The card's words, said once: the service is the visible text,
            // and the rest of the card sits outside the link.
            aria-label={label}
            className={CARD_LINK}
          >
            {booking.serviceSummary}
          </Link>
        </p>
        <span className="flex shrink-0 items-center gap-1.5">
          {/* Said on the list too, so a customer checking on their money
              doesn't have to open each booking. */}
          {refunded && (
            <StatusChip tone="done" dot={false}>
              {t('Refunded')}
            </StatusChip>
          )}
          <StatusChip tone={chip.tone} dot={false}>
            {chip.label}
          </StatusChip>
        </span>
      </div>
      {/* The garage, the car (on every card, F3) and when. */}
      <p className="text-t4 leading-snug text-dim">
        {[
          booking.vendorName,
          booking.vehicle?.model,
          formatWhen(booking.scheduledAtIso, now),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {pickup && <p className="text-t4 text-dim">{pickup}</p>}
      <div className="mt-1 flex items-center justify-between gap-3 text-t4">
        <NeedsLine
          needs={needs}
          quiet={
            waitingUntil ??
            (customerSeesPaid(booking)
              ? t('Paid')
              : booking.paymentStatus === 'refunded'
                ? t('Paid · refunded')
                : '')
          }
        />
        <span className="flex shrink-0 items-center gap-1.5">
          {/* The struck price is the only hint that a code was used; the
              full breakdown lives on the detail page. */}
          {inspection ? (
            // A no-fee inspection (0073): never ₹0, the bill once it comes.
            <span className={cn('text-t3 text-text-primary', inspection.amount !== null && 'font-numeric')}>
              {inspection.text}
            </span>
          ) : (
            <>
              {booking.discountAmount > 0 && (
                <s className="font-numeric text-text-muted">
                  {money(booking.subtotalPrice)}
                </s>
              )}
              <span className="font-numeric text-t3 text-text-primary">
                {money(booking.servicePrice)}
              </span>
            </>
          )}
        </span>
      </div>
      {/* Past only: a booking that is still on has nothing to repeat yet.
          Quiet text, not a button. 44px tall to the thumb while drawn small.
          The name starts with the words on screen, so "tap Book again" in
          voice control finds it; the rest tells one card's link from the
          next. */}
      {tab === 'past' && (
        <div className="-mb-3 mt-1 flex justify-end border-t border-line pt-0.5">
          <Link
            href={bookAgainPath(booking, matchSavedAddress(booking, addresses))}
            aria-label={t('Book again: {serviceSummary} at {vendorName}', { serviceSummary: booking.serviceSummary, vendorName: booking.vendorName })}
            className="relative z-10 -mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-[8px] px-2 text-t4 font-medium text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary/70"
          >
            <IconRepeat size={15} aria-hidden="true" />
            {t('Book again')}
          </Link>
        </div>
      )}
    </ScCard>
  )
}

function BookingsContent() {
  const t = useT()
  const router = useRouter()
  // The chosen tab lives in the URL (?tab=past), so Back from a booking lands
  // on the tab it was opened from. Upcoming is the bare /bookings.
  const tab = parseBookingListTab(useSearchParams().get('tab'))
  const user = useAuthStore((s) => s.user)
  const customerBookings = useBookingsStore((s) => s.customerBookings)
  const fetchCustomerBookings = useBookingsStore((s) => s.fetchCustomerBookings)
  const addresses = useUserStore((s) => s.addresses)
  const fetchAddresses = useUserStore((s) => s.fetchAddresses)
  // Whether this visit has an answer yet. Until it does, an empty list means
  // "not loaded", and saying "No upcoming bookings" would be a guess.
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  // Bumped by Retry to fetch again.
  const [attempt, setAttempt] = useState(0)
  const now = useNow(60_000)
  // What each booking needs from the customer (F3), from Updates' to-do:
  // the same reckoning as Home's must-act card. Reading it marks nothing
  // as read.
  const updates = useQuery({
    queryKey: homeKeys.updates(),
    queryFn: getUpdates,
    staleTime: 30_000,
    enabled: !!user,
  })
  const actions = actionsByBooking(updates.data?.todo, money)

  // Book again on a past doorstep or pickup & drop booking opens on the
  // address it went to, so the saved ones are read once there is one.
  const needsAddresses =
    addresses.length === 0 &&
    customerBookings.some((b) => b.bookingType !== 'dropin')
  useEffect(() => {
    if (user && needsAddresses) void fetchAddresses().catch(() => undefined)
  }, [user, needsAddresses, fetchAddresses])

  useEffect(() => {
    if (!user) return
    fetchCustomerBookings().then(
      () => setLoaded(true),
      () => setLoadFailed(true)
    )
  }, [user, fetchCustomerBookings, attempt])

  // replaceState rather than router.replace: nothing needs fetching, Next
  // keeps useSearchParams in step with the native call, and switching tabs is
  // not a step Back should walk through.
  const changeTab = (value: string) => {
    const next = parseBookingListTab(value)
    window.history.replaceState(
      null,
      '',
      next === DEFAULT_BOOKING_LIST_TAB
        ? window.location.pathname
        : `?tab=${next}`
    )
  }

  if (!user) {
    return (
      <CustomerShell showNav className="gap-4 py-4">
        <TopBar title={t('Bookings')} large={isHomeHubEnabled()} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-t3 font-semibold text-text-primary">
            {t('Login to view your bookings')}
          </p>
          <p className="text-t4 text-text-secondary">
            {t('Sign in to see your booking history')}
          </p>
          <ScButton
            variant="main"
            className="mt-2 w-auto px-8"
            onClick={() => router.push('/login')}
          >
            {t('Login')}
          </ScButton>
        </div>
      </CustomerShell>
    )
  }

  const lists = splitBookingList(customerBookings)
  // Bookings already in the store (from an earlier visit, or the one just
  // made) are shown straight away and refreshed underneath.
  const waiting = !loaded && customerBookings.length === 0

  const panel = (which: BookingListTab) => {
    if (loadFailed && !loaded && customerBookings.length === 0) {
      return (
        <ErrorState
          message={t("Couldn't load your bookings. Check your connection.")}
          onRetry={() => {
            setLoadFailed(false)
            setAttempt((n) => n + 1)
          }}
        />
      )
    }
    if (waiting) {
      return (
        <div className="flex flex-col gap-2" aria-busy="true">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )
    }

    const list = lists[which]
    if (list.length === 0) {
      return which === 'upcoming' ? (
        <div className="flex flex-col items-center gap-2 px-2 py-14 text-center">
          <h2 className="text-[20px] font-normal tracking-[-0.015em] text-text-primary">
            {t('No upcoming bookings')}
          </h2>
          <p className="text-t3 text-text-secondary">
            {t('Book a car wash or detailing at a garage near you.')}
          </p>
          {/* The empty list's way forward, as the one red pill (F5). */}
          <ScButton
            variant="main"
            fullWidth={false}
            onClick={() => router.push('/search')}
            className="mt-4"
          >
            {t('Find garages')}
            <IconArrowUpRight size={17} stroke={1.5} aria-hidden />
          </ScButton>
        </div>
      ) : (
        <EmptyState
          title={t('No past bookings yet')}
          subtitle={t('Bookings that are done or cancelled show here.')}
        />
      )
    }

    // Past: a compact list. Upcoming: the next booking as a ticket, the
    // rest as cards under it.
    if (which === 'past') {
      return (
        <div className="flex flex-col gap-1.5">
          {list.map((booking, i) => (
            <Reveal key={booking.id} index={i}>
              <PastRow booking={booking} addresses={addresses} now={now} />
            </Reveal>
          ))}
        </div>
      )
    }
    const [next, ...later] = list
    return (
      <div className="flex flex-col gap-2">
        <TicketCard
          booking={next}
          action={actions.get(next.id) ?? null}
          now={now}
        />
        {later.map((booking, i) => (
          <Reveal key={booking.id} index={i}>
            <BookingCard
              booking={booking}
              tab={which}
              addresses={addresses}
              action={actions.get(booking.id) ?? null}
              now={now}
            />
          </Reveal>
        ))}
      </div>
    )
  }

  return (
    <CustomerShell showNav className="gap-4 py-4">
      <TopBar title={t('Bookings')} large={isHomeHubEnabled()} />

      {/* Real tabs, not the segmented control: each has its own list and its
          own empty state, so there is a panel for each to name. */}
      {/* Pull the list down to ask again now (moment 6); it also
          refreshes by itself on every visit, as before. */}
      <PullToRefresh
        onRefresh={() =>
          Promise.all([fetchCustomerBookings(), updates.refetch()]).then(
            () => setLoaded(true),
            () => undefined
          )
        }
      >
      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList aria-label={t('Bookings')}>
          <TabsTrigger value="upcoming" className="min-h-11">
            {t('Upcoming')}
          </TabsTrigger>
          <TabsTrigger value="past" className="min-h-11">
            {t('Past')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming">{panel('upcoming')}</TabsContent>
        <TabsContent value="past">{panel('past')}</TabsContent>
      </Tabs>
      </PullToRefresh>
    </CustomerShell>
  )
}

export default function BookingsListPage() {
  // useSearchParams needs a Suspense boundary above it, or the build bails
  // out of rendering the whole route on the server.
  return (
    <Suspense>
      <BookingsContent />
    </Suspense>
  )
}
