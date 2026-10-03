'use client'

import { useMemo } from 'react'
import { Map, MapMarker, MarkerContent } from '@repo/ui/sc/map'
import { MapController } from '@repo/ui/features/map-controller'
import { MAP_STYLES, MAP_THEME } from '@repo/core/map'

interface Point {
  lat: number
  lng: number
}

/**
 * The Directions sheet's picture of the trip: the garage, and the customer
 * once their position is known, framed together.
 *
 * Its own module so the sheet can load it with next/dynamic: maplibre-gl is
 * the heaviest thing in the app, and a booking page should not ship it to
 * every visitor for a map only some of them open.
 *
 * Not interactive: it is a picture of where the garage is, and a map that pans
 * inside a sheet steals the drag that should scroll or close it.
 */
export default function BookingDirectionsMap({ garage, here }: { garage: Point; here: Point | null }) {
  const bounds = useMemo(
    () =>
      here
        ? {
            minLat: Math.min(here.lat, garage.lat),
            maxLat: Math.max(here.lat, garage.lat),
            minLng: Math.min(here.lng, garage.lng),
            maxLng: Math.max(here.lng, garage.lng),
          }
        : null,
    [here, garage]
  )

  return (
    <Map
      className="h-full w-full"
      styles={MAP_STYLES}
      theme={MAP_THEME}
      center={[garage.lng, garage.lat]}
      zoom={14}
      interactive={false}
      attributionControl={false}
    >
      <MapController fitBounds={bounds} />
      <MapMarker latitude={garage.lat} longitude={garage.lng}>
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
  )
}
