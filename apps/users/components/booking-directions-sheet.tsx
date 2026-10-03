'use client'

import { useEffect, useMemo, useState } from 'react'
import { IconNavigation } from '@tabler/icons-react'
import { Map, MapMarker, MarkerContent } from '@repo/ui/sc/map'
import { ScSheet } from '@repo/ui/sc/modal'
import { MapController } from '@repo/ui/features/map-controller'
import { toMinutes, useTravelTime } from '@repo/core/api/hooks/use-travel-time'
import { directionsHref } from '@repo/core/contact-links'
import { MAP_STYLES, MAP_THEME, formatDistance, straightLineKm } from '@repo/core/map'
import { coarse, useLocationStore, type ActiveLocation } from '@repo/core/stores/location-store'
import type { Booking } from '@repo/core/types'
import { formatDuration } from '@repo/core/utils'

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
      <DirectionsContent booking={booking} />
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
 * Where the customer is now, read once per opening.
 *
 * Asked of the browser directly rather than through the location store: the
 * store's location is the one home sorts by, and a customer who set it to a
 * saved address for browsing should not have it swapped for wherever they
 * happen to be standing when they check directions. A fresh GPS fix the store
 * already holds is reused instead of asking again.
 */
function useCurrentPosition(): Fix | null {
  const [fix, setFix] = useState<Fix | null>(() =>
    !navigator.geolocation
      ? { state: 'unavailable' }
      : freshGps(useLocationStore.getState().location)
  )
  const asked = fix !== null

  useEffect(() => {
    if (asked) return
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
  }, [asked])

  return fix
}

function DirectionsContent({ booking }: { booking: Booking }) {
  const garage = booking.garage
  const pinned = garage && garage.lat !== null && garage.lng !== null
  const garagePoint = pinned ? { lat: garage.lat as number, lng: garage.lng as number } : null
  const fix = useCurrentPosition()
  const here = fix?.state === 'found' ? { lat: fix.lat, lng: fix.lng } : null

  // Rounded like every other routing call: ~110 m is plenty for a drive time,
  // and the server never needs the customer's exact position.
  const travel = useTravelTime(here ? coarse(here) : null, garagePoint)

  const bounds = useMemo(
    () =>
      here && garagePoint
        ? {
            minLat: Math.min(here.lat, garagePoint.lat),
            maxLat: Math.max(here.lat, garagePoint.lat),
            minLng: Math.min(here.lng, garagePoint.lng),
            maxLng: Math.max(here.lng, garagePoint.lng),
          }
        : null,
    // Primitive deps: the objects above are rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [here?.lat, here?.lng, garagePoint?.lat, garagePoint?.lng]
  )

  const mapsHref = garage
    ? directionsHref({
        lat: garage.lat,
        lng: garage.lng,
        // The city alone is not a destination: without a street address
        // there is no text fallback, only the pin.
        address: garage.address ? [garage.address, garage.city].filter(Boolean).join(', ') : undefined,
      })
    : null

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-text-primary">Directions</h2>
        <p className="mt-1 text-[13px] text-text-secondary">{booking.vendorName}</p>
        {garage?.address && (
          <p className="text-[12px] text-text-muted">
            {[garage.address, garage.city].filter(Boolean).join(', ')}
          </p>
        )}
      </div>

      {garagePoint && (
        // Not interactive: it is a picture of where the garage is, and a map
        // that pans inside a sheet steals the drag that should close it.
        <div className="h-44 overflow-hidden rounded-xl border border-border">
          <Map
            className="h-full w-full"
            styles={MAP_STYLES}
            theme={MAP_THEME}
            center={[garagePoint.lng, garagePoint.lat]}
            zoom={14}
            interactive={false}
            attributionControl={false}
          >
            <MapController fitBounds={bounds} />
            <MapMarker latitude={garagePoint.lat} longitude={garagePoint.lng}>
              <MarkerContent>
                <span className="block rounded-full bg-brand-red px-2.5 py-1 text-[12px] font-semibold text-brand-white shadow-md">
                  Garage
                </span>
              </MarkerContent>
            </MapMarker>
            {here && (
              <MapMarker latitude={here.lat} longitude={here.lng}>
                <MarkerContent>
                  <span
                    aria-label="You"
                    className="block size-3.5 rounded-full border-2 border-brand-black bg-brand-white shadow-[0_0_0_4px_rgba(255,255,255,0.25)]"
                  />
                </MarkerContent>
              </MapMarker>
            )}
          </Map>
        </div>
      )}

      <TravelLine fix={fix} garagePoint={garagePoint} travel={travel.data ?? null} routing={travel.isFetching} />

      {mapsHref && (
        <a
          href={mapsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="press flex w-full items-center justify-center gap-2 rounded-full bg-brand-red py-4 text-[15px] font-semibold text-brand-white transition-colors hover:bg-brand-red-hover"
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
  travel,
  routing,
}: {
  fix: Fix | null
  garagePoint: { lat: number; lng: number } | null
  travel: { distanceM: number; durationS: number } | null
  routing: boolean
}) {
  let line: React.ReactNode
  if (!garagePoint) {
    line = 'This garage has not pinned its location yet. Google Maps will search by its address.'
  } else if (!fix) {
    line = 'Finding your location…'
  } else if (fix.state === 'denied') {
    line = 'Allow location access to see how long the drive is.'
  } else if (fix.state === 'unavailable') {
    line = "Couldn't find your location. Google Maps can still take you there."
  } else if (travel) {
    line = (
      <>
        <span className="font-numeric font-bold text-text-primary">
          {formatDuration(toMinutes(travel.durationS))}
        </span>{' '}
        drive ·{' '}
        <span className="font-numeric font-medium text-text-primary">
          {formatDistance(travel.distanceM / 1000)}
        </span>{' '}
        from you
      </>
    )
  } else if (routing) {
    line = 'Working out the drive…'
  } else {
    // Routing unavailable: a distance, never dressed up as a time.
    line = (
      <>
        <span className="font-numeric font-medium text-text-primary">
          {formatDistance(straightLineKm({ lat: fix.lat, lng: fix.lng }, garagePoint))}
        </span>{' '}
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
