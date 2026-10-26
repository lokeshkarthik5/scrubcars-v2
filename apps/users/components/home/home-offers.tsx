'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { AddCarSheet } from '@repo/ui/features/add-car-sheet'
import { OfferCarousel, OfferCoupon } from '@repo/ui/home/offer-coupon'
import { invalidateHome, useDismissOffer } from '@repo/core/api/hooks/use-home'
import type { HomeOffer } from '@repo/core/api/home'
import { offerFigureOf, offerMetaLines } from '@repo/core/home-display'
import { usePendingCheckoutStore } from '@repo/core/stores/pending-checkout-store'
import type { Vehicle } from '@repo/core/types'

interface HomeOffersProps {
  offers: HomeOffer[]
  userId: string
  /** The car on screen in the hero, which checkout should open on. */
  vehicleId: string | null
  hasCar: boolean
  /** A bill is due: the coupons step back so Pay stays the heaviest thing. */
  muted: boolean
}

/** Where an offer opens: its garage's page, or the list of garages. */
export function offerPath(offer: Pick<HomeOffer, 'vendorId' | 'code'>): string {
  return offer.vendorId
    ? `/garage/${offer.vendorId}?code=${encodeURIComponent(offer.code)}`
    : '/garages'
}

/**
 * Up to three offers, below the car as dark tickets (F2: the approved Home
 * mockup), in Home's one swipe row. It never moves on its own.
 *
 * A tap remembers the code (pending-checkout store) and goes where it can be
 * used: a garage's own offer to that garage's page, carrying the code, and a
 * Detlio-wide one to the list of garages, to pick one. Checkout then applies
 * it once the services and the car are known. Every code is priced against a
 * car, so a customer with none adds one first, in place, and carries on.
 *
 * × hides the offer for good, on every device. The code still works if they
 * type it at checkout.
 */
export function HomeOffers({
  offers,
  userId,
  vehicleId,
  hasCar,
  muted,
}: HomeOffersProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const rememberOffer = usePendingCheckoutStore((s) => s.rememberOffer)
  const dismiss = useDismissOffer()
  const [needsCarFor, setNeedsCarFor] = useState<HomeOffer | null>(null)

  const go = (offer: HomeOffer, carId: string | null) => {
    rememberOffer({
      userId,
      code: offer.code,
      vendorId: offer.vendorId,
      vehicleId: carId,
      endsAt: offer.endsAt,
    })
    router.push(offerPath(offer))
  }

  const select = (offer: HomeOffer) => {
    if (!hasCar) {
      setNeedsCarFor(offer)
      return
    }
    go(offer, vehicleId)
  }

  if (offers.length === 0) return null

  return (
    <>
      <OfferCarousel label="Offers">
        {offers.map((offer) => (
          <OfferCoupon
            key={offer.id}
            eyebrow={
              offer.vendorId
                ? { kind: 'garage', label: offer.vendorName ?? 'Garage' }
                : { kind: 'detlio', label: 'Detlio' }
            }
            title={offer.title}
            metaLines={offerMetaLines(offer, { hasCar })}
            figure={offerFigureOf(offer)}
            code={offer.code}
            muted={muted}
            className="offer-coupon--dark"
            onSelect={() => select(offer)}
            onDismiss={() => dismiss.mutate(offer.id)}
          />
        ))}
      </OfferCarousel>

      <AddCarSheet
        open={needsCarFor !== null}
        onClose={() => setNeedsCarFor(null)}
        onAdded={(vehicle: Vehicle) => {
          const offer = needsCarFor
          setNeedsCarFor(null)
          // Home is now a different page (a car, its tiles, garages' offers),
          // so coming back from /garages must not show the cached one.
          void invalidateHome(queryClient)
          if (offer) go(offer, vehicle.id)
        }}
        // Home is only ever drawn with the hub on.
        hero
      />
    </>
  )
}
