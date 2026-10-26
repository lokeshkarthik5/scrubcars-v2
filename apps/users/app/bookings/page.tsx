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
import { formatWhen } from '@repo/core/format'
import { useQuery } from '@tanstack/react-query'
import { homeKeys } from '@repo/core/api/hooks/use-home'
import { getUpdates } from '@repo/core/api/home'
import { useNow } from '@repo/core/hooks/use-now'
import {
  actionsByBooking,
  answersByLine,
  customerStatusChip,
} from '@/lib/booking-status'
import { money } from '@/lib/money'
import { bookAgainPath, matchSavedAddress } from '@repo/core/book-again'
import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types'
import { PICKUP_STAGE_NOW, pickupStageOf } from '@repo/core/pickup'
import { useUserStore } from '@repo/core/stores/user-store'
import {
  DEFAULT_BOOKING_LIST_TAB,
  parseBookingListTab,
  splitBookingList,
  type BookingListTab,
} from '@repo/core/my-bookings'
import { cn } from '@repo/core/utils'
import type { Address, Booking } from '@repo/core/types'

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
    ? BOOKING_TYPE_LABELS.pickup
    : `${BOOKING_TYPE_LABELS.pickup} · ${PICKUP_STAGE_NOW[stage]}`
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
  const chip = customerStatusChip(booking.status)
  const refunded =
    booking.status === 'cancelled' && booking.refund.status === 'refunded'
  const pickup = pickupLine(booking)
  const unpaid =
    booking.paymentMethod === 'online' &&
    booking.paymentStatus === 'pending' &&
    booking.status === 'pending'
  const needs = action ?? (unpaid ? 'Pay to hold your slot' : null)
  const waitingUntil =
    !needs &&
    booking.status === 'pending' &&
    booking.responseDeadline &&
    Date.parse(booking.responseDeadline.respondBy) > now
      ? answersByLine(booking.responseDeadline.respondBy, now)
      : null

  return (
    // A booking that needs an answer gets a red hairline and says what (F3).
    <ScCard
      className={cn(
        'press relative flex flex-col gap-1.5 p-5',
        needs && 'border-brand-red/70'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[17px] leading-snug text-text-primary">
          <Link
            href={`/bookings/${booking.id}`}
            // The card's words, said once: the service is the visible text,
            // and the rest of the card sits outside the link.
            aria-label={`${booking.serviceSummary} at ${booking.vendorName}, ${chip.label}${refunded ? ', Refunded' : ''}${needs ? `, ${needs}` : ''}, ${booking.scheduledAt}`}
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
              Refunded
            </StatusChip>
          )}
          <StatusChip tone={chip.tone} dot={false}>
            {chip.label}
          </StatusChip>
        </span>
      </div>
      {/* The garage, the car (on every card, F3) and when. */}
      <p className="text-[13px] leading-snug text-dim">
        {[
          booking.vendorName,
          booking.vehicle?.model,
          formatWhen(booking.scheduledAtIso, now),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {pickup && <p className="text-[13px] text-dim">{pickup}</p>}
      <div className="mt-1 flex items-center justify-between gap-3 text-[13px]">
        {needs ? (
          <span className="flex min-w-0 items-center gap-1.5 text-text-primary">
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-brand-red"
            />
            {needs}
          </span>
        ) : (
          <span className="min-w-0 text-dim">
            {waitingUntil ??
              (booking.paymentStatus === 'paid'
                ? 'Paid'
                : booking.paymentStatus === 'refunded'
                  ? 'Paid · refunded'
                  : '')}
          </span>
        )}
        <span className="flex shrink-0 items-center gap-1.5">
          {/* The struck price is the only hint that a code was used; the
              full breakdown lives on the detail page. */}
          {booking.discountAmount > 0 && (
            <s className="font-numeric text-text-muted">
              {money(booking.subtotalPrice)}
            </s>
          )}
          <span className="font-numeric text-[15px] text-text-primary">
            {money(booking.servicePrice)}
          </span>
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
            aria-label={`Book again: ${booking.serviceSummary} at ${booking.vendorName}`}
            className="relative z-10 -mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-medium text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary/70"
          >
            <IconRepeat size={15} aria-hidden="true" />
            Book again
          </Link>
        </div>
      )}
    </ScCard>
  )
}

function BookingsContent() {
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
        <TopBar title="Bookings" large={isHomeHubEnabled()} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-[15px] font-semibold text-text-primary">
            Login to view your bookings
          </p>
          <p className="text-[13px] text-text-secondary">
            Sign in to see your booking history
          </p>
          <ScButton
            variant="main"
            className="mt-2 w-auto px-8"
            onClick={() => router.push('/login')}
          >
            Login
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
          message="Couldn't load your bookings. Check your connection."
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
            No upcoming bookings
          </h2>
          <p className="text-[15px] text-text-secondary">
            Book a car wash or detailing at a garage near you.
          </p>
          {/* The empty list's way forward, as the one red pill (F5). */}
          <ScButton
            variant="main"
            fullWidth={false}
            onClick={() => router.push('/search')}
            className="mt-4"
          >
            Find garages
            <IconArrowUpRight size={17} stroke={1.5} aria-hidden />
          </ScButton>
        </div>
      ) : (
        <EmptyState
          title="No past bookings yet"
          subtitle="Bookings that are done or cancelled show here."
        />
      )
    }

    return (
      <div className="flex flex-col gap-2">
        {list.map((booking, i) => (
          <Reveal key={booking.id} index={i}>
            <BookingCard
              booking={booking}
              tab={which}
              addresses={addresses}
              action={
                which === 'upcoming' ? (actions.get(booking.id) ?? null) : null
              }
              now={now}
            />
          </Reveal>
        ))}
      </div>
    )
  }

  return (
    <CustomerShell showNav className="gap-4 py-4">
      <TopBar title="Bookings" large={isHomeHubEnabled()} />

      {/* Real tabs, not the segmented control: each has its own list and its
          own empty state, so there is a panel for each to name. */}
      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList aria-label="Bookings">
          <TabsTrigger value="upcoming" className="min-h-11">
            Upcoming
          </TabsTrigger>
          <TabsTrigger value="past" className="min-h-11">
            Past
          </TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming">{panel('upcoming')}</TabsContent>
        <TabsContent value="past">{panel('past')}</TabsContent>
      </Tabs>
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
