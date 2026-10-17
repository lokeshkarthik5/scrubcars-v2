'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { track } from '@repo/core/analytics'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { Toast } from '@repo/ui/sc/toast'
import { AddCarSheet } from '@repo/ui/features/add-car-sheet'
import { invalidateHome, useDismissReviewPrompt, useHome } from '@repo/core/api/hooks/use-home'
import type { HomeCar } from '@repo/core/api/home'
import { firstNameOf } from '@repo/core/home-display'
import { useNow } from '@repo/core/hooks/use-now'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { coarse, useLocationStore } from '@repo/core/stores/location-store'
import { usePendingCheckoutStore } from '@repo/core/stores/pending-checkout-store'
import { useUserStore } from '@repo/core/stores/user-store'
import { CustomerShell } from '@/components/customer-shell'
import { BillDueCard, GarageClosedCard, RateWashCard } from './action-cards'
import { CarHero } from './car-hero'
import { HomeHeader } from './home-header'
import { HomeOffers } from './home-offers'
import { NearbyCard } from './nearby-card'
import { RightTile } from './right-tile'
import { TipCard } from './tip-card'
import { UpdatesBlock } from './updates-block'
import { WashStatusTile } from './wash-status-tile'

function HomeHubContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const authUser = useAuthStore((s) => s.user)
  const isSessionReady = useAuthStore((s) => s.isSessionReady)
  const profile = useUserStore((s) => s.profile)
  const fetchProfile = useUserStore((s) => s.fetchProfile)
  const location = useLocationStore((s) => s.location)
  const rememberCar = usePendingCheckoutStore((s) => s.rememberCar)
  const dismissRate = useDismissReviewPrompt()

  // Rounded to ~110 m before it leaves the phone: Nearby needs a
  // neighbourhood, not a doorstep.
  const origin = location ? coarse(location) : null
  const home = useHome(origin, { enabled: !!authUser })
  const clock = useNow()

  const [selectedCar, setSelectedCar] = useState(0)
  const [addCarOpen, setAddCarOpen] = useState(false)
  const [toastDismissed, setToastDismissed] = useState(false)
  const showToast = !toastDismissed && searchParams.get('welcome') === '1'

  // /home is public, but the hub is a signed-in customer's own page: a
  // visitor is sent to the list of garages, which is what /home was for them.
  useEffect(() => {
    if (isSessionReady && !authUser) router.replace('/garages')
  }, [isSessionReady, authUser, router])

  useEffect(() => {
    if (authUser) void fetchProfile().catch(() => undefined)
  }, [authUser, fetchProfile])

  // Once per signed-in arrival on Home.
  const signedIn = !!authUser
  useEffect(() => {
    if (signedIn) track('home_view')
  }, [signedIn])

  if (!authUser) return null

  const user = profile ?? authUser
  const data = home.data
  // The server's clock, so "today", "8 days ago" and "Ends today" are all
  // counted from the same moment the server counted them.
  const now = new Date(data?.now ?? clock)
  const firstName = data?.header.firstName || firstNameOf(user.name)

  const cars = data?.cars ?? []
  const carIndex = Math.min(selectedCar, Math.max(0, cars.length - 1))
  const car: HomeCar | undefined = cars[carIndex]
  const offers = data?.offers ?? []
  const mustAct = data?.mustAct ?? null
  // One red action on the screen: Pay while a bill is due, Book a wash otherwise.
  const billDue = mustAct?.kind === 'bill_due'
  const rateCard = !mustAct && data?.softCard?.kind === 'rate' ? data.softCard : null

  const bookWash = (picked: HomeCar) => {
    rememberCar({ userId: authUser.id, vehicleId: picked.id })
    // The list opens on the mode this car was last booked in, so a doorstep
    // customer is not shown garages to drive to.
    const doorstep = picked.rightTile.kind === 'book_again' && picked.rightTile.bookingType === 'doorstep'
    router.push(doorstep ? '/garages?mode=doorstep' : '/garages')
  }

  return (
    // The floating nav and the padding that keeps the tip clear of it, as on
    // every customer screen with the hub on (CustomerShell).
    <CustomerShell showNav className="pt-3">
      <div className="flex flex-col gap-3">
        <h1 className="sr-only">Home</h1>
        <Toast
          message={`Welcome, ${firstName || 'there'}! Find your first car wash.`}
          visible={showToast}
          onDismiss={() => setToastDismissed(true)}
        />

        <HomeHeader
          firstName={firstName}
          avatarUrl={data?.header.avatarUrl ?? user.avatarUrl ?? null}
          hasUnread={data?.header.hasUnread ?? false}
        />

        {home.isPending ? (
          <>
            <div className="h-[124px] rounded-card shimmer" />
            <div className="h-[314px] rounded-card shimmer" />
          </>
        ) : !data ? (
          // Not "nothing here": that is a fact about the account, and saying
          // it when the request failed would be untrue.
          <ErrorState message="Couldn't load your Home. Check your connection." onRetry={() => void home.refetch()} />
        ) : (
          <>
            {/* At most two cards above the car: one must-act card, then the
                offers; or the offers, then Rate your wash. */}
            {mustAct?.kind === 'bill_due' && <BillDueCard card={mustAct} now={now} />}
            {mustAct?.kind === 'garage_closed' && <GarageClosedCard card={mustAct} />}

            {offers.length > 0 && (
              <HomeOffers
                offers={offers}
                userId={authUser.id}
                vehicleId={car?.id ?? null}
                hasCar={cars.length > 0}
                muted={billDue}
              />
            )}

            {rateCard && (
              <RateWashCard
                card={rateCard}
                dismissing={dismissRate.isPending}
                onDismiss={() => dismissRate.mutate(rateCard.bookingId)}
              />
            )}

            <CarHero
              cars={cars}
              selected={carIndex}
              onSelect={setSelectedCar}
              place={user.area ?? null}
              short={!!mustAct && offers.length > 0}
              quiet={billDue}
              onBookWash={bookWash}
              onAddCar={() => setAddCarOpen(true)}
            />

            {car ? (
              <div className="grid grid-cols-2 gap-3">
                <WashStatusTile car={car} now={now} />
                <RightTile
                  tile={car.rightTile}
                  onBook={() => rememberCar({ userId: authUser.id, vehicleId: car.id })}
                />
              </div>
            ) : (
              // No car left, but a booking for one since removed: Home
              // never hides a booking.
              data.nextBooking && (
                <div className="grid grid-cols-2 gap-3">
                  <RightTile tile={data.nextBooking} />
                </div>
              )
            )}

            {data.updates && <UpdatesBlock updates={data.updates} now={now} />}

            <NearbyCard nearby={data.nearby} located={!!origin} />

            <TipCard tip={data.tip} now={now} />
          </>
        )}
      </div>

      <AddCarSheet
        open={addCarOpen}
        onClose={() => setAddCarOpen(false)}
        onAdded={() => void invalidateHome(queryClient)}
        hero
      />
    </CustomerShell>
  )
}

/**
 * The customer's Home hub (behind NEXT_PUBLIC_HOME_HUB): offers first, the
 * car and Book a wash, its wash bar and what is next, Updates, nearby
 * garages and a tip. One read, GET /users/me/home; each part the server
 * could not load comes back empty and the rest still shows.
 *
 * Suspense because the welcome toast reads the URL (?welcome=1), as the
 * garage list does.
 */
export function HomeHubScreen() {
  return (
    <Suspense>
      <HomeHubContent />
    </Suspense>
  )
}
