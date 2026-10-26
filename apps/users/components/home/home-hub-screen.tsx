'use client'

import { Suspense, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { track } from '@repo/core/analytics'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { Toast } from '@repo/ui/sc/toast'
import {
  invalidateHome,
  useDismissReviewPrompt,
  useHome,
} from '@repo/core/api/hooks/use-home'
import { useServiceReminderAction } from '@repo/core/api/hooks/use-car-history'
import type { HomeCar } from '@repo/core/api/home'
import { bookingTypeParam } from '@repo/core/booking-types'
import { firstNameOf } from '@repo/core/home-display'
import { useNow } from '@repo/core/hooks/use-now'
import { useAuthStore } from '@repo/core/stores/auth-store'
import {
  coarse,
  isCitywide,
  useLocationStore,
} from '@repo/core/stores/location-store'
import { usePendingCheckoutStore } from '@repo/core/stores/pending-checkout-store'
import { useUserStore } from '@repo/core/stores/user-store'
import { CustomerShell } from '@/components/customer-shell'
import {
  BillDueCard,
  ComplaintAnswerCard,
  ExtraWorkHomeCard,
  GarageClosedCard,
  RateWashCard,
  ServiceReminderHomeCard,
  TimeProposalHomeCard,
} from './action-cards'
import { CarHero } from './car-hero'
import { RewardsStrip } from '@/components/rewards/rewards-strip'
import { BadgeCelebration } from '@/components/rewards/badge-celebration'
import { ChallengeLine } from '@/components/rewards/challenge-line'
import {
  rewardsEnabled,
  useRewardsConfig,
  useRewardsSummary,
} from '@repo/core/api/hooks/use-rewards'
import { garageLive, useGaragePulls } from '@repo/core/api/hooks/use-garage'
import { PullRevealSheet } from '@/components/garage/pull-reveal-sheet'
import { HomeHeader } from './home-header'
import { HomeOffers } from './home-offers'
import { NearbyCard } from './nearby-card'
import { RightTile } from './right-tile'

// Sheets closed on arrival are loaded after the page, not with it: they are
// out of the first load's JavaScript, and on the page well before anyone can
// tap what opens them. Client-only, since closed they render nothing anyway.
const AddCarSheet = dynamic(
  () => import('@repo/ui/features/add-car-sheet').then((m) => m.AddCarSheet),
  { ssr: false }
)
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
  const reminderAction = useServiceReminderAction()

  // Rounded to ~110 m before it leaves the phone: Nearby needs a
  // neighbourhood, not a doorstep. "All of Chennai" is a city choice, not a
  // place the customer stood, so it is not sent.
  const origin = location && !isCitywide(location) ? coarse(location) : null
  const home = useHome(origin, { enabled: !!authUser })
  // Detlio Rewards (0050): the stars on the car and the line under it, only
  // while the API says rewards are live.
  const rewardsConfig = useRewardsConfig()
  const rewardsOn = rewardsEnabled(rewardsConfig.data) && !!authUser
  const rewards = useRewardsSummary(rewardsOn)
  // 0057: new Garage cards not seen yet, revealed in a sheet (not a card: the two-card rule holds).
  const garagePulls = useGaragePulls(
    garageLive(rewardsConfig.data) && !!authUser
  )
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
  // One red action on the screen: the must-act card's (Pick a time, Review
  // extra work, Pay a bill) while there is one that carries it, Book a wash
  // otherwise.
  const billDue =
    mustAct?.kind === 'bill_due' ||
    mustAct?.kind === 'time_proposal' ||
    mustAct?.kind === 'extra_work_due'
  const rateCard =
    !mustAct && data?.softCard?.kind === 'rate' ? data.softCard : null
  // Only ever in a free place: the server sends it only with no must-act
  // card and no Rate your wash.
  const complaintCard =
    !mustAct && data?.softCard?.kind === 'complaint_resolved'
      ? data.softCard
      : null
  // A coating or detailing follow-up (0046): only in a free place too.
  const reminderCard =
    !mustAct && data?.softCard?.kind === 'service_reminder'
      ? data.softCard
      : null

  const bookWash = (picked: HomeCar) => {
    rememberCar({ userId: authUser.id, vehicleId: picked.id })
    // The list opens on the mode this car was last booked in, so a doorstep
    // or pickup & drop customer is not shown garages to drive to.
    const lastMode =
      picked.rightTile.kind === 'book_again'
        ? bookingTypeParam(picked.rightTile.bookingType)
        : null
    router.push(lastMode ? `/garages?mode=${lastMode}` : '/garages')
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
          now={now}
        />

        {home.isPending ? (
          <>
            <div className="h-[124px] rounded-card shimmer" />
            <div className="h-[314px] rounded-card shimmer" />
          </>
        ) : !data ? (
          // Not "nothing here": that is a fact about the account, and saying
          // it when the request failed would be untrue.
          <ErrorState
            message="Couldn't load your Home. Check your connection."
            onRetry={() => void home.refetch()}
          />
        ) : (
          <>
            {/* At most one card above the car: one must-act card; or, when
                there is none, Rate your wash (or in its place a complaint we
                just resolved, or else a coating or detailing follow-up). */}
            {mustAct?.kind === 'time_proposal' && (
              <TimeProposalHomeCard card={mustAct} />
            )}
            {mustAct?.kind === 'extra_work_due' && (
              <ExtraWorkHomeCard card={mustAct} now={now} />
            )}
            {mustAct?.kind === 'bill_due' && (
              <BillDueCard card={mustAct} now={now} />
            )}
            {mustAct?.kind === 'garage_closed' && (
              <GarageClosedCard card={mustAct} />
            )}

            {rateCard && (
              <RateWashCard
                card={rateCard}
                dismissing={dismissRate.isPending}
                onDismiss={() => dismissRate.mutate(rateCard.bookingId)}
              />
            )}

            {complaintCard && <ComplaintAnswerCard card={complaintCard} />}

            {reminderCard && (
              <ServiceReminderHomeCard
                card={reminderCard}
                now={now}
                busy={reminderAction.isPending}
                onBook={() =>
                  rememberCar({
                    userId: authUser.id,
                    vehicleId: reminderCard.vehicleId,
                  })
                }
                onSnooze={() =>
                  reminderAction.mutate({
                    reminderId: reminderCard.reminderId,
                    action: 'snooze',
                  })
                }
                onDismiss={() =>
                  reminderAction.mutate({
                    reminderId: reminderCard.reminderId,
                    action: 'dismiss',
                  })
                }
              />
            )}

            <CarHero
              cars={cars}
              selected={carIndex}
              onSelect={setSelectedCar}
              short={!!mustAct}
              quiet={billDue}
              onBookWash={bookWash}
              onAddCar={() => setAddCarOpen(true)}
              shine={rewards.data && cars.length > 0 ? rewards.data.card : null}
            />
            {/* 0054: any badge to celebrate. */}
            {rewards.data?.extras && rewards.data.extras.unseen.length > 0 && (
              <BadgeCelebration badges={rewards.data.extras.unseen} />
            )}
            {/* Badges first; new cars on the next visit, so two sheets never open at once. */}
            {garagePulls.data &&
              garagePulls.data.unseen > 0 &&
              !(
                rewards.data?.extras && rewards.data.extras.unseen.length > 0
              ) && (
                <PullRevealSheet
                  pulls={garagePulls.data.pulls}
                  firstName={authUser.name?.trim().split(/\s+/)[0] ?? null}
                />
              )}

            {car ? (
              <div className="grid grid-cols-2 gap-3">
                <RightTile
                  tile={car.rightTile}
                  onBook={() =>
                    rememberCar({ userId: authUser.id, vehicleId: car.id })
                  }
                />
                <WashStatusTile car={car} now={now} />
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

            {/* Offers below the car, dark, in Home's one swipe row (F2). */}
            {offers.length > 0 && (
              <HomeOffers
                offers={offers}
                userId={authUser.id}
                vehicleId={car?.id ?? null}
                hasCar={cars.length > 0}
                muted={billDue}
              />
            )}

            {rewards.data && <RewardsStrip summary={rewards.data} />}
            {/* 0054: a live challenge as a line (not a card), under the car's tiles. */}
            {rewards.data?.extras?.challenge && (
              <ChallengeLine challenge={rewards.data.extras.challenge} />
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
 * The customer's Home hub (behind NEXT_PUBLIC_HOME_HUB): what needs the
 * customer first, then the car and Book a wash, what is next and its wash
 * bar, the offers, Updates, nearby garages and a tip (the approved F2 Home). One read, GET /users/me/home; each part the server
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
