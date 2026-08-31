'use client'

import { useEffect, useRef } from 'react'
import { useMap } from '@repo/ui/sc/map'
import { PICKER_ZOOM } from '@repo/core/map'

export interface MapBounds {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

/** The order PostGIS's ST_MakeEnvelope takes, so nothing reshuffles it later. */
export function boundsToParam(bounds: MapBounds): string {
  return [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat]
    .map((n) => n.toFixed(5))
    .join(',')
}

interface MapControllerProps {
  /** Fired when the user taps the map, to move the pin there. */
  onMapClick?: (lat: number, lng: number) => void
  /**
   * Recentre target. Only set for placements the user did not make by dragging
   * the map itself — flying to a pin someone just dragged would yank the ground
   * out from under them.
   */
  flyTo?: { lat: number; lng: number } | null
  /**
   * Fired once the map settles, with the viewport rectangle. Debounced by
   * MapLibre itself (`moveend`, not `move`), so panning does not produce a
   * call per frame.
   */
  onBoundsChange?: (bounds: MapBounds, center: { lat: number; lng: number }) => void
  /** Fit the map to these bounds once, e.g. to frame an initial result set. */
  fitBounds?: MapBounds | null
}

/**
 * Imperative bits of the picker's map.
 *
 * mapcn's <Map> takes MapLibre's construction options, which are read once at
 * init — so taps and recentring both need the live instance, reached through
 * the context <Map> provides. That means this has to be a child, not a prop.
 */
export function MapController({
  onMapClick,
  flyTo,
  onBoundsChange,
  fitBounds,
}: MapControllerProps) {
  const { map } = useMap()

  // Held in a ref so the listener is registered once rather than re-registered
  // every time the parent re-renders with a new closure. Synced in an effect,
  // not during render — a render can be discarded, and writing a ref from one
  // that is would leave the handler pointing at a closure that never committed.
  const clickRef = useRef(onMapClick)

  useEffect(() => {
    clickRef.current = onMapClick
  }, [onMapClick])

  useEffect(() => {
    if (!map) return

    const handler = (e: { lngLat: { lat: number; lng: number } }) => {
      clickRef.current?.(e.lngLat.lat, e.lngLat.lng)
    }

    map.on('click', handler)
    return () => {
      map.off('click', handler)
    }
  }, [map])

  /**
   * Keeps the canvas matched to its container.
   *
   * MapLibre sizes its canvas once at construction and only re-measures on
   * *window* resize. Anything that changes the container without changing the
   * window — a layout swap, a panel opening, an orientation-driven reflow —
   * leaves a canvas that no longer fills its box, which shows up as a dead
   * strip along one edge that reads as a broken border.
   */
  useEffect(() => {
    if (!map) return

    const container = map.getContainer()
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(container)
    return () => observer.disconnect()
  }, [map])

  useEffect(() => {
    if (!map || !flyTo) return
    map.flyTo({
      center: [flyTo.lng, flyTo.lat],
      zoom: Math.max(map.getZoom(), PICKER_ZOOM),
      duration: 600,
    })
  }, [map, flyTo])

  const boundsRef = useRef(onBoundsChange)

  useEffect(() => {
    boundsRef.current = onBoundsChange
  }, [onBoundsChange])

  /**
   * Deliberately keyed on `map` alone, NOT on `isLoaded`.
   *
   * mapcn sets `isLoaded` from MapLibre's `load` event, which does not fire
   * until the *style* has downloaded — and the basemap is a donation-funded
   * public instance with no SLA. Waiting for it meant a slow tile server left
   * the results query permanently disabled: a blank screen reading "Looking in
   * this area…" forever, with working data one call away.
   *
   * `getBounds()` needs no network. It is projection maths on a map instance
   * that exists the moment the canvas does, so results load even when the
   * basemap behind them does not.
   */
  useEffect(() => {
    if (!map) return

    const report = () => {
      const bounds = map.getBounds()
      const center = map.getCenter()
      boundsRef.current?.(
        {
          minLng: bounds.getWest(),
          minLat: bounds.getSouth(),
          maxLng: bounds.getEast(),
          maxLat: bounds.getNorth(),
        },
        { lat: center.lat, lng: center.lng }
      )
    }

    // Report the opening viewport too, so the first search does not wait for
    // the user to move a map they may be perfectly happy with.
    report()
    map.on('moveend', report)
    return () => {
      map.off('moveend', report)
    }
  }, [map])

  useEffect(() => {
    if (!map || !fitBounds) return
    map.fitBounds(
      [
        [fitBounds.minLng, fitBounds.minLat],
        [fitBounds.maxLng, fitBounds.maxLat],
      ],
      { padding: 48, duration: 600, maxZoom: 15 }
    )
  }, [map, fitBounds])

  return null
}
