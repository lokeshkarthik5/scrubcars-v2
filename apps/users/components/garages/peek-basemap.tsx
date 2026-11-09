'use client'

import { useEffect, useRef } from 'react'
import * as MapLibreGL from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MAP_STYLES } from '@repo/core/map'
import type { LatLng } from '@/lib/map-view'

// MapLibre 6 parses tiles in a worker it loads from a URL of its own; with
// none set it loads the page itself as the worker, which dies at once, and
// every tile then waits for ever (the peek stayed dark). The same worker the
// map screen uses (packages/ui's sc/map.tsx); whichever loads first sets it.
if (typeof window !== 'undefined' && !MapLibreGL.getWorkerUrl()) {
  MapLibreGL.setWorkerUrl(
    `https://unpkg.com/maplibre-gl@${MapLibreGL.getVersion()}/dist/maplibre-gl-worker.mjs`
  )
}

/**
 * The map peek's streets: a still MapLibre map of the customer's area on the
 * dark style, drawn once and never touched (no pan, zoom or tap: the whole
 * card is the link to /map). Loaded on its own, after the list and once the
 * browser is idle (map-peek.tsx), so the ~200 KB of MapLibre never delays a
 * garage card; until it lands, and if the tile server never answers, the
 * plane stays dark and the dots are there regardless.
 *
 * The map is the size of the peek's plane with `centre` in its middle, at the
 * zoom the dots were placed for, so its streets sit under them exactly.
 */
export function PeekBasemap({ centre, zoom }: { centre: LatLng; zoom: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreGL.Map | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const map = new MapLibreGL.Map({
      container: ref.current,
      style: MAP_STYLES.dark,
      center: [centre.lng, centre.lat],
      zoom,
      interactive: false,
      // Never more than 2x: the plane is larger than the card and tilted
      // away, so a 3x canvas would be over twice the pixels for nothing.
      pixelRatio: Math.min(2, window.devicePixelRatio || 1),
      attributionControl: { compact: true },
      // A still picture: no fade between tile levels to wait on, and no
      // second render pass for a map nobody moves.
      fadeDuration: 0,
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // Made once; a new centre or zoom moves it below rather than rebuilding it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    mapRef.current?.jumpTo({ center: [centre.lng, centre.lat], zoom })
  }, [centre.lat, centre.lng, zoom])

  // MapLibre's stylesheet makes its container `position: relative`, which
  // undid an `absolute inset-0` on it: the box collapsed to no height, the map
  // sized itself to nothing and fetched no tiles, so the streets never came.
  // The map fills a box of its own inside the positioned one.
  return (
    <div aria-hidden="true" className="absolute inset-0">
      <div ref={ref} className="h-full w-full" />
    </div>
  )
}
