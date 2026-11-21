'use client'

import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { IconHierarchy2 } from '@tabler/icons-react'
import { NEW_GARAGE_LABEL, hasStarScore, mainGoogleRating } from '@repo/core/ratings'
import { DetlioMark, GoogleMapsText, GoogleMark } from '@repo/ui/sc/rating-marks'
import { BOOKING_TYPE_LABELS, bookingTypeParam } from '@repo/core/booking-types'
import { distanceAndDrive } from '@repo/core/drive-time'
import { straightLineKm } from '@repo/core/map'
import { anywhereInCityLine } from '@repo/core/reach'
import { branchesLine } from '@repo/core/branches'
import {
  isApproximate,
  isCitywide,
  useHydratedLocation,
} from '@repo/core/stores/location-store'
import type { BookingType, Vendor } from '@repo/core/types'
import { TierMark } from '@repo/ui/features/tier-medal'
import { GarageTownChip } from '@repo/ui/features/outside-city'
import { GarageCover, GarageMonogram } from '@repo/ui/features/garage-cover'
import { matchSpans } from '@repo/core/moments'
import { fill, useT } from '@repo/core/i18n'

/**
 * Text with the words a search matched marked (`mo-match`: the customer
 * website draws a red-light underline under them; elsewhere a mark is plain
 * text). Without a query it is the text as it is.
 */
function Matched({ text, query }: { text: string; query?: string }) {
  if (!query) return <>{text}</>
  return (
    <>
      {matchSpans(text, query).map((span, i) =>
        span.match ? (
          <mark key={i} className="mo-match bg-transparent text-inherit">
            {span.text}
          </mark>
        ) : (
          <span key={i}>{span.text}</span>
        )
      )}
    </>
  )
}

function ModeBadge({ label, tone }: { label: string; tone: 'garage' | 'doorstep' }) {
  const t = useT()
  return (
    <span
      className={
        tone === 'garage'
          ? 'rounded-md bg-success-muted px-2 py-0.5 text-[11px] font-medium text-success'
          : 'rounded-md bg-surface-elevated px-2 py-0.5 text-[11px] font-medium text-text-secondary'
      }
    >
      {t(label)}
    </span>
  )
}

export function VendorCard({
  vendor,
  mode,
  action,
  note,
  chips,
  footer,
  attached,
  approxDistance,
  measureFromLocation = false,
  highlight,
}: {
  vendor: Vendor
  /**
   * The At garage / Doorstep / Pickup & drop choice the list was filtered by. Carried into
   * the garage page so the customer is not asked again there or at checkout.
   */
  mode?: BookingType
  /**
   * A control over the photo's top-right corner (the customer app's heart).
   * Drawn beside the card's link, never inside it: a button in a link is
   * one target that announces as two.
   */
  action?: ReactNode
  /** One quiet line under the details ("Not taking bookings right now"). */
  note?: string | null
  /** Small chips under the details, inside the card ("Can collect your car"). */
  chips?: ReactNode
  /**
   * Controls under the card, outside its link ("See prices" on a garage just
   * outside the customer's area, and the slot beside it).
   */
  footer?: ReactNode
  /**
   * A part joined to the bottom of the card, inside its border but outside
   * its link (the rescue's "Same job" price and times, which are links of
   * their own: a link in a link is one target that announces as two).
   */
  attached?: ReactNode
  /**
   * Whether the distance is measured from an area's centre rather than the
   * customer's own fix, so it reads "~6.2 km". Left out, it follows the
   * stored location (an area is approximate); a list measured from somewhere
   * else (a booking's address) says false.
   */
  approxDistance?: boolean
  /**
   * For a list the API measured no distance for (Saved garages): measure it
   * here, from the customer's location to the pin. Off for every list the
   * API measures itself, so a card left on screen while the list reloads
   * never shows a distance the list was not sorted by.
   */
  measureFromLocation?: boolean
  /** A search's words, marked where the name or the matched service has them. */
  highlight?: string
}) {
  // The logo has its own badge now, so the cover is gallery-only — reusing the
  // logo as a full-bleed cover would show the same image twice on the card.
  const t = useT()
  // Google's rating while it is the main one (21 Nov 2026, @repo/core/ratings).
  const google = mainGoogleRating(vendor)
  const cover = vendor.photos[0] ?? null
  // Null distance means the request carried no origin, not that the garage is
  // at zero km — the same "unknown is not zero" rule applied to price and rating
  // just below. A list with no distances of its own (Saved garages,
  // `measureFromLocation`) is measured here from the customer's location,
  // when one is set and the garage is pinned; "All of Chennai" is no place,
  // so nothing then.
  const location = useHydratedLocation()
  const origin = location && !isCitywide(location) ? location : null
  const km =
    vendor.distanceKm ??
    (measureFromLocation && origin && vendor.lat != null && vendor.lng != null
      ? straightLineKm(origin, { lat: vendor.lat, lng: vendor.lng })
      : null)
  const hasDistance = km !== null
  // "6.2 km · ~20 min" (0062): every card, every list. The drive time is an
  // estimate from the distance (lib drive-time), never a routing call.
  const distanceText = hasDistance
    ? distanceAndDrive(km, approxDistance ?? isApproximate(location))
    : null
  const modeParam = mode ? bookingTypeParam(mode) : null
  const anywhere = anywhereInCityLine(vendor, mode)
  const branchLine = branchesLine(vendor.branchGroup)

  return (
    <div className="relative">
      <Link
        href={
          modeParam
            ? `/garage/${vendor.id}?mode=${modeParam}`
            : `/garage/${vendor.id}`
        }
      >
        <article
          className={
            attached
              ? 'press overflow-hidden rounded-t-[16px] border border-b-0 border-border bg-surface transition-colors'
              : 'press overflow-hidden rounded-[16px] border border-border bg-surface transition-colors hover:border-text-secondary/40'
          }
        >
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
              // No photo on file: the garage's own designed cover (its
              // initials, area and modes on its colour), never stock imagery
              // that could pass for the garage, nor a grey box.
              <GarageCover vendor={vendor} />
            )}

            {vendor.logoUrl ? (
              <div className="absolute bottom-2 left-2 h-10 w-10 overflow-hidden rounded-[10px] border border-white/70 bg-surface shadow-sm">
                <Image
                  src={vendor.logoUrl}
                  alt={t('{name} logo', { name: vendor.name })}
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              </div>
            ) : (
              // No logo: a monogram tile in the cover's colour, over a photo
              // or the designed cover alike.
              <GarageMonogram
                vendor={vendor}
                className="absolute bottom-2 left-2 h-10 w-10 rounded-[10px] text-[14px] shadow-sm"
              />
            )}
          </div>

          <div className="flex flex-col gap-1.5 px-3.5 py-3">
            <div className="flex items-start justify-between gap-2">
              {/* One sign right after the name, the tier medal (0063: the
                  highest tier Detlio shows, never more than one), and the
                  name gives way first (truncates), so it never pushes the
                  booking badges off a 360px card. */}
              <h3 className="flex min-w-0 flex-1 items-center gap-1 text-[15px] font-semibold text-text-primary">
                <span className="truncate">
                  <Matched text={vendor.name} query={highlight} />
                </span>
                {vendor.tier && <TierMark tier={vendor.tier} />}
              </h3>
              {/* At most 60% of the row, wrapping: Tamil names for the ways
                  of being served are longer than the English. */}
              <div className="flex max-w-[60%] shrink-0 flex-wrap justify-end gap-1.5">
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

            {/* A new garage (fewer than 3 counted reviews, 0065) reads as "New
                on Detlio": one review can't rank it, and 0.0 stars would look
                like a bad score rather than an absent one. A ₹0 floor is
                skipped rather than rendered as a blank fact; so is the
                distance (below) until there is a location.

                The figures — score, distance, price — are in the brand's numeric
                face; the words between them stay Inter. */}
            <div className="flex items-center gap-1.5 text-[12px] text-text-secondary">
              {google ? (
                // Google's rating for a new garage linked to its listing
                // (21 Nov 2026): Google's G, and "Google Maps" on its own
                // line below.
                <>
                  <GoogleMark size={12} />
                  <span className="font-numeric font-medium text-text-primary">
                    {google.rating.toFixed(1)}
                  </span>
                  <span>({google.reviewCount})</span>
                </>
              ) : hasStarScore(vendor) ? (
                <>
                  <DetlioMark size={13} rating={vendor.rating} className="text-text-primary" />
                  <span aria-hidden="true" className="font-numeric font-medium text-text-primary">
                    {vendor.rating.toFixed(1)}
                  </span>
                  <span>({vendor.reviewCount})</span>
                </>
              ) : (
                <span className="font-medium text-text-primary">{t(NEW_GARAGE_LABEL)}</span>
              )}
              {vendor.startingPrice > 0 && (
                <>
                  <span>·</span>
                  <span>
                    {fill(t('From {price}'), {
                      price: (
                        <span className="font-numeric font-medium text-text-primary">
                          ₹{vendor.startingPrice}
                        </span>
                      ),
                    })}
                  </span>
                </>
              )}
            </div>

            {google && <GoogleMapsText className="self-start" />}

            {/* A garage in another town than the customer's city says so on
                its card, so nobody opens it, or books it, thinking it is
                round the corner; one in their city says nothing (0070). */}
            <GarageTownChip garage={vendor} className="mt-0.5 self-start" />

            {/* Only on a search that found the garage by one of its services:
                without it, "ceramic" listing a garage called "Marina Auto" reads
                like a wrong result. */}
            {vendor.matchedService && (
              <p className="truncate text-[12px] text-text-secondary">
                {fill(t('Offers {service}'), {
                  service: (
                    <span className="font-medium text-text-primary">
                      <Matched text={vendor.matchedService} query={highlight} />
                    </span>
                  ),
                })}
              </p>
            )}
            {/* "Comes anywhere in Chennai" (0069): on a Doorstep or Pickup &
                drop list, a garage that covers its whole city says so. */}
            {anywhere && <p className="truncate text-[12px] text-text-secondary">{anywhere}</p>}
            {/* "1 of 3 Shine Auto Spa branches" (0081): live branches only. */}
            {branchLine && (
              <p className="flex items-center gap-1.5 truncate text-[12px] text-text-secondary">
                <IconHierarchy2 size={13} aria-hidden="true" className="shrink-0" />
                {branchLine}
              </p>
            )}
            {note && <p className="truncate text-[12px] text-text-muted">{note}</p>}
            {/* Distance and drive time on a line of their own, with any chips
                after them, so the figures never push the price off a 360px
                card. */}
            {(distanceText || chips) && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {distanceText && (
                  <span
                    data-distance=""
                    className="whitespace-nowrap rounded-md bg-surface-elevated px-2 py-0.5 font-numeric text-[12px] font-medium text-text-primary"
                  >
                    {distanceText}
                  </span>
                )}
                {chips}
              </div>
            )}
          </div>
        </article>
      </Link>
      {attached && (
        <div className="overflow-hidden rounded-b-[16px] border border-t-0 border-border bg-surface">
          {attached}
        </div>
      )}
      {action && <div className="absolute right-2 top-2">{action}</div>}
      {footer}
    </div>
  )
}
