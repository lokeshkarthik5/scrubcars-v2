'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconRepeat } from '@tabler/icons-react'
import { CustomerShell } from '@/components/customer-shell'
import { isHomeHubEnabled } from '@/lib/home-hub'
import { customerBookingStatusBadge, ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { Reveal } from '@repo/ui/sc/reveal'
import { EmptyState, ErrorState, SkeletonCard } from '@repo/ui/sc/empty-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/sc/tabs'
import { TopBar } from '@repo/ui/sc/top-bar'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import { formatBookingAmount } from '@repo/core/pricing'
import { bookAgainPath } from '@repo/core/book-again'
import {
  DEFAULT_BOOKING_LIST_TAB,
  parseBookingListTab,
  splitBookingList,
  type BookingListTab,
} from '@repo/core/my-bookings'
import { cn } from '@repo/core/utils'
import type { Booking } from '@repo/core/types'

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
  "after:absolute after:-inset-px after:rounded-[14px] after:content-['']",
  'focus-visible:after:ring-2 focus-visible:after:ring-text-primary/70'
)

function BookingCard({ booking, tab }: { booking: Booking; tab: BookingListTab }) {
  const badge = customerBookingStatusBadge(booking.status)
  const refunded = booking.status === 'cancelled' && booking.refund.status === 'refunded'

  return (
    <ScCard className="press relative flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] font-semibold text-text-primary">
            <Link
              href={`/bookings/${booking.id}`}
              // The card's words, said once: the service is the visible text,
              // and the rest of the card sits outside the link.
              aria-label={`${booking.serviceSummary} at ${booking.vendorName}, ${badge.label}${refunded ? ', Refunded' : ''}, ${booking.scheduledAt}`}
              className={CARD_LINK}
            >
              {booking.serviceSummary}
            </Link>
          </p>
          <p className="text-[11px] text-text-secondary">{booking.vendorName}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          {/* Said on the list too, so a customer checking on their money
              doesn't have to open each booking. */}
          {refunded && <ScBadge variant="muted">Refunded</ScBadge>}
          <ScBadge variant={badge.variant}>{badge.label}</ScBadge>
        </span>
      </div>
      {/* When and how much are figures, in the brand's numeric face. */}
      <div className="flex items-center justify-between text-[11px] text-text-secondary">
        <span className="font-numeric font-medium">{booking.scheduledAt}</span>
        <span className="flex items-center gap-1.5">
          {/* The struck price is the only hint that a code was used; the
              full breakdown lives on the detail page. */}
          {booking.discountAmount > 0 && (
            <s className="font-numeric font-medium text-text-muted">
              {formatBookingAmount(booking.subtotalPrice)}
            </s>
          )}
          <span className="font-numeric font-bold text-text-primary">
            {formatBookingAmount(booking.servicePrice)}
          </span>
        </span>
      </div>
      {/* Past only: a booking that is still on has nothing to repeat yet.
          Quiet text, not a button — a list of red "Book again"s would shout
          over the one thing each card is for, opening it. 44px tall to the
          thumb while drawn small: the negative margin hands the extra height
          back to the card. The name starts with the words on screen, so
          "tap Book again" in voice control finds it; the rest tells one card's
          link from the next. */}
      {tab === 'past' && (
        <div className="-mb-2 flex justify-end border-t border-border pt-0.5">
          <Link
            href={bookAgainPath(booking)}
            aria-label={`Book again: ${booking.serviceSummary} at ${booking.vendorName}`}
            className="relative z-10 -mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-[8px] px-2 text-[12px] font-semibold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary/70"
          >
            <IconRepeat size={14} aria-hidden="true" />
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
  // Whether this visit has an answer yet. Until it does, an empty list means
  // "not loaded", and saying "No upcoming bookings" would be a guess.
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  // Bumped by Retry to fetch again.
  const [attempt, setAttempt] = useState(0)

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
      next === DEFAULT_BOOKING_LIST_TAB ? window.location.pathname : `?tab=${next}`
    )
  }

  if (!user) {
    return (
      <CustomerShell showNav showBrand className="gap-4 py-4">
        <TopBar title="Bookings" large={isHomeHubEnabled()} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-[15px] font-semibold text-text-primary">Login to view your bookings</p>
          <p className="text-[13px] text-text-secondary">Sign in to see your booking history</p>
          <ScButton className="mt-2 w-auto px-8" onClick={() => router.push('/login')}>Login</ScButton>
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
        <EmptyState
          title="No upcoming bookings"
          subtitle="Book a car wash or detailing at a garage near you."
          actionLabel="Find garages"
          onAction={() => router.push('/search')}
        />
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
            <BookingCard booking={booking} tab={which} />
          </Reveal>
        ))}
      </div>
    )
  }

  return (
    <CustomerShell showNav showBrand className="gap-4 py-4">
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
