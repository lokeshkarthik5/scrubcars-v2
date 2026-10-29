'use client'

import { useQuery } from '@tanstack/react-query'
import { IconBuildingStore } from '@tabler/icons-react'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { ScCard } from '@/components/ui/card'
import { SkeletonCard } from '@repo/ui/sc/empty-state'
import { VendorCard } from '@repo/ui/features/vendor-card'
import { getOtherGarages } from '@repo/core/api/bookings'
import { bookingTypeParam } from '@repo/core/booking-types'
import type { Booking } from '@repo/core/types'

/**
 * "Book another garage" (0042), under a booking its garage did not accept in
 * time: up to three nearby live garages that take the same booking type and
 * do one of the booked kinds of service, as the garage list's own cards,
 * each opening its garage page with the booking type already chosen. With
 * none near, or nowhere to measure from, the list itself for that type.
 * Secondary throughout: nothing here is owed, and the refund line above is
 * the page's news.
 */
export function OtherGaragesCard({ booking }: { booking: Booking }) {
  const others = useQuery({
    queryKey: ['bookings', booking.id, 'other-garages'],
    queryFn: () => getOtherGarages(booking.id),
    staleTime: 5 * 60_000,
  })
  const mode = others.data?.bookingType ?? booking.bookingType
  const modeParam = bookingTypeParam(mode)
  const listHref = modeParam ? `/garages?mode=${modeParam}` : '/garages'
  const vendors = others.data?.vendors ?? []

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
          Book another garage
        </h2>
        <p className="mt-0.5 text-[12px] text-text-secondary">
          Nearby garages that do this kind of job
          {vendors.length > 0 ? ', nearest first' : ''}.
        </p>
      </div>

      {others.isPending ? (
        <div aria-busy="true">
          <SkeletonCard />
        </div>
      ) : vendors.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {vendors.map((vendor) => (
            <li key={vendor.id}>
              {/* Measured from the booking's own address or garage, not
                  from an area the customer picked: never "~". */}
              <VendorCard vendor={vendor} mode={mode} approxDistance={false} />
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
          <p className="text-[13px] text-text-secondary">
            {others.isError
              ? "Couldn't load garages near you."
              : 'No other garage nearby does this job right now.'}
          </p>
        </ScCard>
      )}

      <ScButtonLink href={listHref} variant="secondary" fullWidth>
        See all garages
      </ScButtonLink>
    </section>
  )
}
