'use client'

import { useEffect, useRef } from 'react'
import type { MapMovementEvent, PaddingOptions } from 'maplibre-gl'
import { useMap } from '@repo/ui/sc/map'
import { PICKER_ZOOM } from '@repo/core/map'

export interface MapBounds {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

/**
 * Tagged onto every camera move the app makes (MapLibre hands a camera call's
 * `eventData` back on that move's events), so `onBoundsChange` can tell the
 * app moving the map from the customer moving it. Pass it as the last
 * argument of a camera call made outside this component, too (a cluster's
 * zoom in), so its settle is reported as programmatic.
 */
export const PROGRAMMATIC_MOVE = { programmatic: true } as const

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
   * call per frame. `programmatic` is true for the opening view and for moves
   * made with PROGRAMMATIC_MOVE (this component's fits and fly-tos included),
   * false when the customer dragged or zoomed.
   */
  onBoundsChange?: (
    bounds: MapBounds,
    center: { lat: number; lng: number },
    meta: { programmatic: boolean }
  ) => void
  /** Fit the map to these bounds, e.g. to frame an initial result set. */
  fitBounds?: MapBounds | null
  /**
   * Fit once per key. Without one, every new `fitBounds` value is fitted,
   * which suits a memoised box; with one, a box that is recomputed on every
   * render is fitted only when the key changes (a new origin, a recentre).
   */
  fitKey?: string | null
  /**
   * Room to leave around the fitted box, in pixels: a number for all sides,
   * or a function read at the moment of the fit, so it can measure the
   * controls drawn over the map then. 48 by default.
   */
  fitPadding?: number | PaddingOptions | (() => number | PaddingOptions)
  /** How far in a fit may zoom. 15 by default. */
  fitMaxZoom?: number
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
  fitKey,
  fitPadding,
  fitMaxZoom,
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
    map.flyTo(
      {
        center: [flyTo.lng, flyTo.lat],
        zoom: Math.max(map.getZoom(), PICKER_ZOOM),
        duration: 600,
      },
      PROGRAMMATIC_MOVE
    )
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

    const report = (programmatic: boolean) => {
      const bounds = map.getBounds()
      const center = map.getCenter()
      boundsRef.current?.(
        {
          minLng: bounds.getWest(),
          minLat: bounds.getSouth(),
          maxLng: bounds.getEast(),
          maxLat: bounds.getNorth(),
        },
        { lat: center.lat, lng: center.lng },
        { programmatic }
      )
    }
    // A camera call's eventData arrives merged into its events, untyped.
    const onMoveEnd = (e: MapMovementEvent) =>
      report((e as MapMovementEvent & { programmatic?: boolean }).programmatic === true)

    // Report the opening viewport too, so the first search does not wait for
    // the user to move a map they may be perfectly happy with. Nobody moved
    // it, so it counts as the app's own.
    report(true)
    map.on('moveend', onMoveEnd)
    return () => {
      map.off('moveend', onMoveEnd)
    }
  }, [map])

  // The last key fitted. A ref, not state: it changes nothing on screen, it
  // only stops the same view being fitted again on the next render.
  const fittedKey = useRef<string | null>(null)

  useEffect(() => {
    if (!map || !fitBounds) return
    if (fitKey != null) {
      if (fittedKey.current === fitKey) return
      fittedKey.current = fitKey
    }
    const padding = typeof fitPadding === 'function' ? fitPadding() : (fitPadding ?? 48)
    map.fitBounds(
      [
        [fitBounds.minLng, fitBounds.minLat],
        [fitBounds.maxLng, fitBounds.maxLat],
      ],
      { padding, duration: 600, maxZoom: fitMaxZoom ?? 15 },
      PROGRAMMATIC_MOVE
    )
  }, [map, fitBounds, fitKey, fitPadding, fitMaxZoom])

  return null
}
