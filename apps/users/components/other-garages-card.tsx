'use client'

import { useQuery } from '@tanstack/react-query'
import { IconBuildingStore, IconClock } from '@tabler/icons-react'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { ScCard } from '@/components/ui/card'
import { SkeletonCard } from '@repo/ui/sc/empty-state'
import { VendorCard } from '@repo/ui/features/vendor-card'
import { getOtherGarages, type RescueGarage } from '@repo/core/api/bookings'
import { serviceLinesOf } from '@repo/core/add-ons'
import { bookingTypeParam } from '@repo/core/booking-types'
import {
  rescueDayLabel,
  rescueHeading,
  rescueSubline,
  rescueTimePath,
  sameJobPrice,
  usualAnswerLabel,
} from '@repo/core/rescue'
import type { Booking, BookingType } from '@repo/core/types'
import { useT } from '@repo/core/i18n'
import { NextFreeRow } from '@/components/garages/next-free-row'

/** "Usually answers in 10 min": the chip after the distance. */
function AnswerChip({ mins }: { mins: number | null }) {
  const label = usualAnswerLabel(mins)
  if (!label) return null
  return (
    <span
      data-answer-chip=""
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-surface-elevated px-2 py-0.5 text-[12px] font-medium text-text-primary"
    >
      <IconClock size={12} aria-hidden className="text-success" />
      {label}
    </span>
  )
}

/** The part joined under a garage's card: the same job's price and the times near the original slot. */
function RescueOfferPart({
  vendor,
  mode,
  addressId,
}: {
  vendor: RescueGarage
  mode: BookingType
  addressId: string | null
}) {
  const t = useT()
  const offer = vendor.rescue
  if (!offer) return null
  return (
    <div className="mx-3.5 flex flex-col gap-2 border-t border-border pb-3.5 pt-3">
      <p className="flex items-center justify-between text-t4">
        <span className="text-text-secondary">{t('Same job')}</span>
        <span className="font-numeric text-[16px] font-semibold text-text-primary">
          {sameJobPrice(offer.price)}
        </span>
      </p>
      <NextFreeRow
        vendor={vendor}
        mode={mode}
        visible
        preset={{
          free: offer.free,
          dayLabel: rescueDayLabel(offer),
          hrefFor: (slot) =>
            rescueTimePath({
              vendorId: vendor.id,
              bookingType: mode,
              serviceIds: offer.serviceIds,
              addressId,
              slot,
            }),
        }}
        className="px-0 pb-0 pt-0"
      />
    </div>
  )
}

/**
 * The rescue (0042, then Nov 2026), under a booking its garage let down —
 * didn't answer in time, declined, or called off: up to three garages that
 * can do the same job for the same car, best first (the server ranks them by
 * distance, how fast each usually answers, how often it accepts, its rating
 * and its recent cancellations), each as the garage list's own card with
 * "Usually answers in N min", the same job's price, and the free times near
 * the original slot. A time opens the booking with the same job picked; the
 * customer pays as for any booking, and the first payment's refund is
 * untouched. With none, or nowhere to measure from, the list itself for
 * that type.
 */
export function OtherGaragesCard({
  booking,
  addressId,
}: {
  booking: Booking
  /** The saved address the booking went to (matchSavedAddress), for doorstep and pickup. */
  addressId: string | null
}) {
  const t = useT()
  const others = useQuery({
    queryKey: ['bookings', booking.id, 'other-garages'],
    queryFn: () => getOtherGarages(booking.id),
    staleTime: 5 * 60_000,
  })
  const mode = others.data?.bookingType ?? booking.bookingType
  const modeParam = bookingTypeParam(mode)
  const listHref = modeParam ? `/garages?mode=${modeParam}` : '/garages'
  const vendors = others.data?.vendors ?? []
  const jobName = serviceLinesOf(booking.items)
    .map((item) => item.name)
    .join(' + ')
  // Something was paid that comes back (a no-fee inspection paid nothing).
  const paid = booking.servicePrice > 0 || (booking.creditPaid ?? 0) > 0

  return (
    <section
      aria-labelledby="other-garages-title"
      className="flex flex-col gap-3"
    >
      <div>
        <h2
          id="other-garages-title"
          className="text-sm font-semibold text-text-primary"
        >
          {rescueHeading()}
        </h2>
        <p className="mt-0.5 text-t5 text-text-secondary">
          {rescueSubline({ jobName: jobName || t('The same job'), bookingType: mode, paid })}
        </p>
      </div>

      {others.isPending ? (
        <div aria-busy="true">
          <SkeletonCard />
        </div>
      ) : vendors.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {vendors.map((vendor) => (
            <li key={vendor.id} data-rescue-garage={vendor.id}>
              {/* Measured from the booking's own address or garage, not
                  from an area the customer picked: never "~". */}
              <VendorCard
                vendor={vendor}
                mode={mode}
                approxDistance={false}
                chips={<AnswerChip mins={vendor.rescue?.usualAnswerMins ?? null} />}
                attached={
                  vendor.rescue ? (
                    <RescueOfferPart vendor={vendor} mode={mode} addressId={addressId} />
                  ) : undefined
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <ScCard className="flex items-center gap-3 px-4 py-3">
          <IconBuildingStore
            size={20}
            aria-hidden="true"
            className="shrink-0 text-text-muted"
          />
          <p className="text-t4 text-text-secondary">
            {others.isError
              ? t("Couldn't load garages near you.")
              : t('No other garage nearby has a time for this job right now.')}
          </p>
        </ScCard>
      )}

      <ScButtonLink href={listHref} variant="secondary" fullWidth>
        {t('See all garages')}
      </ScButtonLink>
    </section>
  )
}
