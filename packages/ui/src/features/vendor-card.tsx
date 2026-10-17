'use client'

import Image from 'next/image'
import Link from 'next/link'
import { IconBuildingStore, IconStarFilled } from '@tabler/icons-react'
import { BOOKING_TYPE_LABELS, bookingTypeParam } from '@repo/core/booking-types'
import type { BookingType, Vendor } from '@repo/core/types'

function ModeBadge({ label, tone }: { label: string; tone: 'garage' | 'doorstep' }) {
  return (
    <span
      className={
        tone === 'garage'
          ? 'rounded-md bg-success-muted px-2 py-0.5 text-[10px] font-medium text-success'
          : 'rounded-md bg-surface-elevated px-2 py-0.5 text-[10px] font-medium text-text-secondary'
      }
    >
      {label}
    </span>
  )
}

export function VendorCard({
  vendor,
  mode,
}: {
  vendor: Vendor
  /**
   * The At garage / Doorstep / Pickup & drop choice the list was filtered by. Carried into
   * the garage page so the customer is not asked again there or at checkout.
   */
  mode?: BookingType
}) {
  // The logo has its own badge now, so the cover is gallery-only — reusing the
  // logo as a full-bleed cover would show the same image twice on the card.
  const cover = vendor.photos[0] ?? null
  // Null distance means the request carried no origin, not that the garage is
  // at zero km — the same "unknown is not zero" rule applied to price and rating
  // just below.
  const hasDistance = vendor.distanceKm !== null
  const modeParam = mode ? bookingTypeParam(mode) : null

  return (
    <Link
      href={
        modeParam
          ? `/garage/${vendor.id}?mode=${modeParam}`
          : `/garage/${vendor.id}`
      }
    >
      <article className="press overflow-hidden rounded-[16px] border border-border bg-surface transition-colors hover:border-text-secondary/40">
        <div className="relative h-[150px] w-full bg-surface-elevated">
          {cover ? (
            <Image
              src={cover}
              alt={vendor.name}
              fill
              sizes="(max-width: 428px) 100vw, 428px"
              className="object-cover"
            />
          ) : (
            // No vendor photo on file — a neutral placeholder rather than stock
            // imagery, so the card never implies a photo we don't have.
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-elevated to-surface">
              <IconBuildingStore size={30} className="text-text-muted" />
            </div>
          )}

          {vendor.logoUrl && (
            <div className="absolute bottom-2 left-2 h-10 w-10 overflow-hidden rounded-[10px] border border-white/70 bg-surface shadow-sm">
              <Image
                src={vendor.logoUrl}
                alt={`${vendor.name} logo`}
                fill
                sizes="40px"
                className="object-cover"
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5 px-3.5 py-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text-primary">
              {vendor.name}
            </h3>
            <div className="flex shrink-0 gap-1.5">
              {vendor.dropinEnabled && (
                <ModeBadge label={BOOKING_TYPE_LABELS.dropin} tone="garage" />
              )}
              {/* On a Pickup & drop list, Pickup & drop takes Doorstep's place:
                  three badges would crowd the name on a 360px phone. Elsewhere
                  the garage page says whether it collects. */}
              {vendor.doorstepEnabled && mode !== 'pickup' && (
                <ModeBadge
                  label={BOOKING_TYPE_LABELS.doorstep}
                  tone="doorstep"
                />
              )}
              {mode === 'pickup' && vendor.pickupEnabled && (
                <ModeBadge label={BOOKING_TYPE_LABELS.pickup} tone="doorstep" />
              )}
            </div>
          </div>

          {/* Distance is absent until the customer shares a location, so it is
              skipped (like a ₹0 floor) rather than rendered as a blank fact.
              An unreviewed vendor reads as "New" — showing 0.0 stars would look
              like a bad score rather than an absent one.

              The figures — score, distance, price — are in the brand's numeric
              face; the words between them stay Inter. */}
          <div className="flex items-center gap-1.5 text-[12px] text-text-secondary">
            {vendor.reviewCount > 0 ? (
              <>
                <IconStarFilled size={12} className="text-warning" />
                <span className="font-numeric font-medium text-text-primary">
                  {vendor.rating.toFixed(1)}
                </span>
                <span>({vendor.reviewCount})</span>
              </>
            ) : (
              <span className="font-medium text-text-primary">New</span>
            )}
            {hasDistance && (
              <>
                <span>·</span>
                <span className="font-numeric font-medium">{vendor.distance}</span>
              </>
            )}
            {vendor.startingPrice > 0 && (
              <>
                <span>·</span>
                <span>
                  From{' '}
                  <span className="font-numeric font-medium text-text-primary">
                    ₹{vendor.startingPrice}
                  </span>
                </span>
              </>
            )}
          </div>

          {/* Only on a search that found the garage by one of its services:
              without it, "ceramic" listing a garage called "Marina Auto" reads
              like a wrong result. */}
          {vendor.matchedService && (
            <p className="truncate text-[12px] text-text-secondary">
              Offers{' '}
              <span className="font-medium text-text-primary">{vendor.matchedService}</span>
            </p>
          )}
        </div>
      </article>
    </Link>
  )
}
