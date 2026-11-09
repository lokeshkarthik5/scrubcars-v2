'use client'

import { useEffect, useRef } from 'react'
import * as MapLibreGL from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MAP_STYLES } from '@repo/core/map'
import type { LatLng } from '@/lib/map-view'

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

  return <div ref={ref} aria-hidden="true" className="absolute inset-0" />
}
