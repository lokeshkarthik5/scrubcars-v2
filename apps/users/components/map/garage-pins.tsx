'use client'

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { MapMarker, MarkerContent, useMap } from '@repo/ui/sc/map'
import { PROGRAMMATIC_MOVE } from '@repo/ui/features/map-controller'
import { cn } from '@repo/core/utils'
import type { Vendor } from '@repo/core/types'
import {
  PIN_MAX_WIDTH_PX,
  bubbleTap,
  frameCentreOffset,
  framingBounds,
  groupPins,
  isInFrame,
  nextInBubble,
  pinLabel,
  type FitPadding,
  type LatLng,
} from '@/lib/map-view'

/**
 * The garages on the map: one pin each, overlapping pins drawn as a count
 * bubble, and the customer's own spot.
 *
 * The bubbles are worked out here rather than with MapLibre's GeoJSON
 * clustering. That needs a source added to the style, and the style comes from
 * a donation-funded tile server this screen deliberately never waits on (see
 * MapController); a slow one would have left the map with no garages at all.
 * The pins are also HTML (a name, a price, a 44 px target) that a GL layer
 * cannot draw without the style's fonts. A page holds at most 50 garages, so
 * grouping them (lib/map-view.ts) is cheap to redo on every zoom.
 *
 * Loaded only with the map (it imports MapLibre through @repo/ui/sc/map).
 */

type PinnedVendor = Vendor & { lat: number; lng: number }

export function GaragePins({
  vendors,
  selectedId,
  onSelect,
  origin,
  getPadding,
  reveal,
}: {
  vendors: Vendor[]
  selectedId: string | null
  onSelect: (vendor: Vendor) => void
  /** The customer's rounded location, drawn as "You". */
  origin?: LatLng
  /** Room the controls and cards take, read when a bubble zooms in. */
  getPadding: () => FitPadding
  /**
   * A garage chosen from its card, to bring into view if its pin is off
   * screen. `n` counts the requests, so choosing the same card again (after
   * the customer panned away) asks again.
   */
  reveal?: { id: string; n: number } | null
}) {
  const { map } = useMap()

  // The zoom the bubbles were worked out for. From MapLibre's own events
  // rather than copied into state by an effect; read to two decimals so a
  // render mid-animation does not regroup on every frame's sliver of zoom.
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!map) return () => undefined
      map.on('zoomend', onChange)
      return () => {
        map.off('zoomend', onChange)
      }
    },
    [map]
  )
  const zoom = useSyncExternalStore(
    subscribe,
    () => (map ? Math.round(map.getZoom() * 100) / 100 : 0),
    () => 0
  )

  const pinned = vendors.filter(
    (vendor): vendor is PinnedVendor => vendor.lat !== null && vendor.lng !== null
  )
  // The chosen garage is never folded into a bubble: its pin is the map's half
  // of the selection, and a red pin hidden inside a "3" would break the link
  // between the card on screen and the place on the map.
  const groups = groupPins(
    pinned.filter((vendor) => vendor.id !== selectedId),
    zoom
  )
  const bubbles = groups.filter((group) => group.members.length > 1)
  // Every pin drawn on its own, the chosen one included, in list order. One
  // keyed list whether or not a pin is chosen: moving the chosen pin to a slot
  // of its own unmounted its button the moment it was picked, and keyboard and
  // screen-reader focus fell back to the start of the page.
  const alone = new Set(
    groups.filter((group) => group.members.length === 1).map((group) => group.members[0].id)
  )
  const singles = pinned.filter((vendor) => vendor.id === selectedId || alone.has(vendor.id))

  const zoomInto = (members: PinnedVendor[]) => {
    if (!map) return
    const box = framingBounds(members, 0.3)
    if (!box) return
    const bounds: [[number, number], [number, number]] = [
      [box.minLng, box.minLat],
      [box.maxLng, box.maxLat],
    ]
    const padding = getPadding()
    // Worked out before moving, because garages on one street can stay one
    // bubble even at the closest a fit reaches. Then the tap brings one of
    // them up instead, and the next tap the next one, rather than fitting the
    // same box again and doing nothing.
    const target = map.cameraForBounds(bounds, { padding, maxZoom: 17 })?.zoom
    const tap = bubbleTap(members, map.getZoom(), target)
    if (tap.zoomTo !== null) {
      map.fitBounds(bounds, { padding, duration: 500, maxZoom: 17 }, PROGRAMMATIC_MOVE)
    }
    if (tap.select) {
      onSelect(
        nextInBubble(
          members,
          pinned.map((vendor) => vendor.id),
          selectedId
        )
      )
    }
  }

  // A garage chosen from its card is brought into view when its pin is off
  // screen, at the zoom the customer is using (no dive to street level). The
  // first tap on a side card is meant for finding its pin; with the pin off
  // screen it otherwise looked like the tap did nothing. A pin already in the
  // clear part of the map is left where it is.
  const revealId = reveal?.id ?? null
  const revealCount = reveal?.n ?? 0
  const revealed = pinned.find((vendor) => vendor.id === revealId) ?? null
  const targetLat = revealed?.lat
  const targetLng = revealed?.lng
  useEffect(() => {
    if (!map || targetLat === undefined || targetLng === undefined) return
    // Already on its way somewhere: a bubble zooming in on this garage, or
    // the customer dragging. Easing now would cut that move short.
    if (map.isMoving()) return
    const container = map.getContainer()
    const view = { width: container.clientWidth, height: container.clientHeight }
    const padding = getPadding()
    if (isInFrame(map.project([targetLng, targetLat]), view, padding)) return
    map.easeTo(
      { center: [targetLng, targetLat], offset: frameCentreOffset(padding), duration: 500 },
      PROGRAMMATIC_MOVE
    )
    // revealCount is the trigger: the same garage chosen again asks again.
  }, [map, targetLat, targetLng, revealCount, getPadding])

  return (
    <>
      {origin && (
        <MapMarker latitude={origin.lat} longitude={origin.lng}>
          <MarkerContent>
            <span
              role="img"
              aria-label="You"
              className="block size-3.5 rounded-full border-2 border-brand-black bg-brand-white shadow-[0_0_0_4px_rgba(255,255,255,0.25)]"
            />
          </MarkerContent>
        </MapMarker>
      )}

      {bubbles.map((group) => (
        <MapMarker
          key={group.key}
          latitude={group.lat}
          longitude={group.lng}
          onClick={() => zoomInto(group.members)}
        >
          <MarkerContent>
            <button
              type="button"
              aria-label={`${group.members.length} garages here. Zoom in`}
              className="grid size-11 place-items-center rounded-full bg-brand-white font-numeric text-[15px] font-bold text-brand-black shadow-[0_2px_10px_rgba(0,0,0,0.5)] ring-4 ring-white/25"
            >
              {group.members.length}
            </button>
          </MarkerContent>
        </MapMarker>
      ))}

      {singles.map((vendor) => (
        <GaragePin
          key={vendor.id}
          vendor={vendor}
          selected={vendor.id === selectedId}
          onSelect={() => onSelect(vendor)}
        />
      ))}
    </>
  )
}

/**
 * One garage: its short name over its starting price, in white on the dark
 * map so it reads at a glance, with a tail marking the exact spot. The chosen
 * garage's pin turns red (the map's one red) and lifts above the rest.
 */
function GaragePin({
  vendor,
  selected,
  onSelect,
}: {
  vendor: PinnedVendor
  selected: boolean
  onSelect: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)

  // Markers are siblings positioned by MapLibre, so later ones paint over
  // earlier ones whatever is inside them. Lifting the chosen pin means raising
  // its marker element, which only MapLibre's DOM can reach.
  useEffect(() => {
    const marker = ref.current?.closest<HTMLElement>('.maplibregl-marker')
    if (!marker) return
    marker.style.zIndex = selected ? '2' : ''
  }, [selected])

  const price = vendor.startingPrice > 0 ? `₹${vendor.startingPrice}` : null

  return (
    // Anchored at the bottom, so the tail's tip sits on the garage itself.
    <MapMarker latitude={vendor.lat} longitude={vendor.lng} anchor="bottom" onClick={onSelect}>
      <MarkerContent>
        <button
          ref={ref}
          type="button"
          aria-label={price ? `${vendor.name}, from ${price}` : vendor.name}
          aria-pressed={selected}
          // The cap is PIN_MAX_WIDTH_PX, which the overlap test and the fit's
          // side padding are worked out from; inline so the three share one
          // number.
          style={{ maxWidth: PIN_MAX_WIDTH_PX }}
          className={cn(
            'relative mb-[6px] flex min-h-11 min-w-11 flex-col items-center justify-center rounded-[12px] px-2.5 py-1 leading-tight shadow-[0_2px_10px_rgba(0,0,0,0.5)] ring-1 transition-transform duration-150 motion-reduce:transition-none',
            selected
              ? '-translate-y-1 scale-110 bg-brand-red text-brand-white ring-brand-red'
              : 'bg-brand-white text-brand-black ring-black/10'
          )}
        >
          <span className="block max-w-full truncate text-[11px] font-semibold">
            {pinLabel(vendor.name)}
          </span>
          {price && <span className="font-numeric text-[13px] font-bold">{price}</span>}
          <span
            aria-hidden
            className={cn(
              'absolute -bottom-[5px] left-1/2 size-2.5 -translate-x-1/2 rotate-45',
              selected ? 'bg-brand-red' : 'bg-brand-white'
            )}
          />
        </button>
      </MarkerContent>
    </MapMarker>
  )
}
