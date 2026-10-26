'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { IconCircleX, IconNavigation } from '@tabler/icons-react'
import { ScSheet } from '@repo/ui/sc/modal'
import { toMinutes, useTravelTime } from '@repo/core/api/hooks/use-travel-time'
import { directionsHref, googleMapsLink } from '@repo/core/contact-links'
import { formatDistance, straightLineKm } from '@repo/core/map'
import { coarse, useLocationStore, type ActiveLocation } from '@repo/core/stores/location-store'
import type { Booking } from '@repo/core/types'
import { formatDuration } from '@repo/core/utils'

// Loaded when the sheet opens, not with the booking page: see the module.
const BookingDirectionsMap = dynamic(() => import('./booking-directions-map'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-surface" />,
})

/**
 * Closer than this by road, the customer is at the garage: a 20-second
 * "drive" rounds to 0 minutes, which would print as "— drive".
 */
const AT_GARAGE_M = 200

/** The drive in words, shared with the Getting there card on the page. */
export function describeDrive(travel: { distanceM: number; durationS: number }): {
  atGarage: boolean
  /** "17 min", never "—": anything under a minute reads as 1 min. */
  time: string
  distance: string
} {
  return {
    atGarage: travel.distanceM < AT_GARAGE_M,
    time: formatDuration(Math.max(1, toMinutes(travel.durationS))),
    distance: formatDistance(travel.distanceM / 1000),
  }
}

interface BookingDirectionsSheetProps {
  open: boolean
  onClose: () => void
  booking: Booking
}

/**
 * How to get to the garage for an at-garage booking: where it is on a small
 * map, how long the drive is from where the customer is now, and a hand-off to
 * Google Maps for the turn-by-turn.
 */
export function BookingDirectionsSheet({ open, onClose, booking }: BookingDirectionsSheetProps) {
  return (
    <ScSheet open={open} onClose={onClose} aria-label="Directions" className="px-4 pt-1">
      {/* Mounted only while open, so the location is asked for when the
          customer opens the sheet, never just because the page loaded. */}
      <DirectionsContent booking={booking} onClose={onClose} />
    </ScSheet>
  )
}

type Fix =
  | { state: 'found'; lat: number; lng: number }
  | { state: 'denied' }
  | { state: 'unavailable' }

/** A GPS fix this recent stands in for asking again. */
const FRESH_FOR_MS = 5 * 60_000

function freshGps(location: ActiveLocation | null): Fix | null {
  return location?.source === 'gps' && Date.now() - location.updatedAt < FRESH_FOR_MS
    ? { state: 'found', lat: location.lat, lng: location.lng }
    : null
}

/**
 * Where the customer is now, read once per opening — and only when `wanted`:
 * for a garage with no pin there is nothing to measure against, and asking
 * for a permission that does nothing risks a lasting "deny" for no reason.
 *
 * Asked of the browser directly rather than through the location store: the
 * store's location is the one home sorts by, and a customer who set it to a
 * saved address for browsing should not have it swapped for wherever they
 * happen to be standing when they check directions. A fresh GPS fix the store
 * already holds is reused instead of asking again.
 */
function useCurrentPosition(wanted: boolean): Fix | null {
  const [fix, setFix] = useState<Fix | null>(() =>
    !wanted
      ? null
      : !navigator.geolocation
        ? { state: 'unavailable' }
        : freshGps(useLocationStore.getState().location)
  )
  const asked = fix !== null

  useEffect(() => {
    if (!wanted || asked) return
    let current = true
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (current) {
          setFix({ state: 'found', lat: position.coords.latitude, lng: position.coords.longitude })
        }
      },
      (error) => {
        if (current) {
          setFix({ state: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable' })
        }
      },
      // A drive estimate does not need a GPS lock: network positioning is
      // faster and kinder to the battery.
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 }
    )
    return () => {
      current = false
    }
  }, [wanted, asked])

  return fix
}

function DirectionsContent({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const garage = booking.garage
  const garageLat = garage?.lat ?? null
  const garageLng = garage?.lng ?? null
  // Stable objects, so the map frames the trip once rather than every render.
  const garagePoint = useMemo(
    () => (garageLat !== null && garageLng !== null ? { lat: garageLat, lng: garageLng } : null),
    [garageLat, garageLng]
  )
  const fix = useCurrentPosition(garagePoint !== null)
  const hereLat = fix?.state === 'found' ? fix.lat : null
  const hereLng = fix?.state === 'found' ? fix.lng : null
  const here = useMemo(
    () => (hereLat !== null && hereLng !== null ? { lat: hereLat, lng: hereLng } : null),
    [hereLat, hereLng]
  )

  // Rounded like every other routing call: ~110 m is plenty for a drive time,
  // and the server never needs the customer's exact position.
  const travel = useTravelTime(here ? coarse(here) : null, garagePoint)

  const fullAddress = garage?.address
    ? [garage.address, garage.city].filter(Boolean).join(', ')
    : undefined
  // The city alone is not a destination: without a street address there is
  // no text fallback, only the pin.
  const mapsHref = garage
    ? directionsHref({ lat: garageLat, lng: garageLng, address: fullAddress, mapsUrl: garage.mapsUrl })
    : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text-primary">Directions</h2>
          <p className="mt-1 text-[13px] text-text-secondary">{booking.vendorName}</p>
          {fullAddress && <p className="text-[12px] text-text-muted">{fullAddress}</p>}
        </div>
        {/* Every way out of this sheet otherwise leaves the app; this is the
            one that comes back to the booking. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center"
        >
          <IconCircleX size={22} className="text-text-secondary" />
        </button>
      </div>

      {garagePoint && (
        <div className="h-44 overflow-hidden rounded-xl border border-border">
          <BookingDirectionsMap garage={garagePoint} here={here} />
        </div>
      )}

      <TravelLine
        fix={fix}
        garagePoint={garagePoint}
        ownMapsLink={!!googleMapsLink(garage?.mapsUrl)}
        travel={travel.data ?? null}
        routing={travel.isFetching}
      />

      {mapsHref && (
        <a
          href={mapsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="press flex w-full items-center justify-center gap-2 rounded-full bg-brand-red-fill py-4 text-[15px] font-semibold text-brand-white transition-colors hover:bg-brand-red-fill-hover"
        >
          <IconNavigation size={18} aria-hidden />
          Open in Google Maps
        </a>
      )}
    </div>
  )
}

/**
 * The one line that answers "how far is it?": the drive time when routing
 * answers, the straight-line distance when it does not, and why there is
 * neither when the location is unknown.
 */
function TravelLine({
  fix,
  garagePoint,
  ownMapsLink,
  travel,
  routing,
}: {
  fix: Fix | null
  garagePoint: { lat: number; lng: number } | null
  /** No pin, but the garage gave its own Google Maps link, which the button opens. */
  ownMapsLink: boolean
  travel: { distanceM: number; durationS: number } | null
  routing: boolean
}) {
  let line: React.ReactNode
  if (!garagePoint) {
    line = ownMapsLink
      ? 'This garage has not pinned its location yet. Google Maps opens its own listing.'
      : 'This garage has not pinned its location yet. Google Maps will search by its address.'
  } else if (!fix) {
    line = 'Finding your location…'
  } else if (fix.state === 'denied') {
    line = 'Allow location access to see how long the drive is.'
  } else if (fix.state === 'unavailable') {
    line = "Couldn't find your location. Google Maps can still take you there."
  } else if (travel) {
    const drive = describeDrive(travel)
    line = drive.atGarage ? (
      "You're at the garage."
    ) : (
      <>
        <span className="font-numeric font-bold text-text-primary">{drive.time}</span> drive ·{' '}
        <span className="font-numeric font-medium text-text-primary">{drive.distance}</span> from
        you
      </>
    )
  } else if (routing) {
    line = 'Working out the drive…'
  } else {
    // Routing unavailable: a distance, never dressed up as a time.
    const km = straightLineKm({ lat: fix.lat, lng: fix.lng }, garagePoint)
    line =
      km * 1000 < AT_GARAGE_M ? (
        "You're at the garage."
      ) : (
        <>
          <span className="font-numeric font-medium text-text-primary">{formatDistance(km)}</span>{' '}
          away in a straight line
        </>
      )
  }

  return (
    <p aria-live="polite" className="text-[13px] text-text-secondary">
      {line}
    </p>
  )
}
