'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Map,
  MapGeoJSON,
  MapMarker,
  MarkerContent,
  useMap,
} from '@repo/ui/sc/map'
import { DEFAULT_CENTER, MAP_STYLES, MAP_THEME } from '@repo/core/map'
import { cn } from '@repo/core/utils'
import { ZONE_PAINT, zoneArea, type ZoneStats } from '@/lib/coverage'

/**
 * The Coverage map (mockup coverage-zones A, zone-finder A): each zone drawn
 * as its area, coloured by progress; a dot per garage and lead; and, in the
 * finder, a ring per result. Loaded in the browser only (coverage-map.tsx).
 * The map is a picture: everything on it can be done from the zone list
 * too, which is what keyboards and screen readers use.
 */

export type DotTone = 'green' | 'orange' | 'red'

export interface MapDot {
  id: string
  lat: number
  lng: number
  tone: DotTone
  label: string
}

export interface MapRing {
  id: string
  lat: number
  lng: number
  label: string
  ticked: boolean
}

export interface CoverageMapProps {
  stats: ZoneStats[]
  dots: MapDot[]
  rings?: MapRing[]
  selectedZoneId?: string | null
  onZoneClick?: (zoneId: string) => void
  /** While set, a click on the map is a point (moving a zone's centre). */
  onPick?: ((point: { lat: number; lng: number }) => void) | null
  /** Fly to this point (the finder's zone, a zone being moved). */
  focus?: { lat: number; lng: number; zoom?: number } | null
  /** Only these zones drawn (the finder draws just its zone). */
  onlyZoneId?: string | null
  className?: string
}

const START_ZOOM = 10.4

const DOT_CLASS: Record<DotTone, string> = {
  green: 'bg-tone-done-dot',
  orange: 'bg-tone-attention-dot',
  red: 'bg-tone-late-dot',
}

/** Sizes the map to its box once loaded (it measures before layout settles). */
function MapResizer() {
  const { map, isLoaded } = useMap()
  useEffect(() => {
    if (!map || !isLoaded) return
    map.resize()
    const later = setTimeout(() => map.resize(), 300)
    return () => clearTimeout(later)
  }, [map, isLoaded])
  return null
}

function MapFocus({ focus }: { focus: CoverageMapProps['focus'] }) {
  const { map, isLoaded } = useMap()
  const lat = focus?.lat
  const lng = focus?.lng
  const zoom = focus?.zoom
  useEffect(() => {
    if (!map || !isLoaded || lat === undefined || lng === undefined) return
    map.flyTo({ center: [lng, lat], zoom: zoom ?? 12.5, duration: 600 })
  }, [map, isLoaded, lat, lng, zoom])
  return null
}

function MapPicker({
  onPick,
}: {
  onPick: (point: { lat: number; lng: number }) => void
}) {
  const { map, isLoaded } = useMap()
  useEffect(() => {
    if (!map || !isLoaded) return
    const canvas = map.getCanvas()
    canvas.style.cursor = 'crosshair'
    const click = (event: { lngLat: { lat: number; lng: number } }) =>
      onPick({
        lat: Number(event.lngLat.lat.toFixed(5)),
        lng: Number(event.lngLat.lng.toFixed(5)),
      })
    map.on('click', click)
    return () => {
      map.off('click', click)
      canvas.style.cursor = ''
    }
  }, [map, isLoaded, onPick])
  return null
}

export default function CoverageMapInner({
  stats,
  dots,
  rings = [],
  selectedZoneId = null,
  onZoneClick,
  onPick = null,
  focus = null,
  onlyZoneId = null,
  className,
}: CoverageMapProps) {
  const drawn = onlyZoneId
    ? stats.filter((s) => s.zone.id === onlyZoneId)
    : stats
  // Zone names crowd the city centre at the city's zoom: the priority zones
  // (and the open one) are named always, the rest once zoomed in.
  const [zoom, setZoom] = useState(START_ZOOM)
  const labelled = drawn.filter(
    (s) =>
      s.zone.priority ||
      s.zone.id === selectedZoneId ||
      zoom >= 11.5 ||
      onlyZoneId
  )
  const allZones = useMemo(() => stats.map((s) => s.zone), [stats])

  const areas = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: drawn.map((s) => ({
        type: 'Feature' as const,
        properties: {
          id: s.zone.id,
          fill: ZONE_PAINT[s.colour].fill,
          line: ZONE_PAINT[s.colour].line,
          selected: s.zone.id === selectedZoneId ? 1 : 0,
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [zoneArea(s.zone, allZones)],
        },
      })),
    }),
    [drawn, allZones, selectedZoneId]
  )

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[14px] border border-border',
        className
      )}
    >
      <Map
        className="h-full w-full"
        styles={MAP_STYLES}
        theme={MAP_THEME}
        center={DEFAULT_CENTER}
        zoom={START_ZOOM}
        attributionControl={false}
        onViewportChange={(viewport) =>
          setZoom(Math.round(viewport.zoom * 4) / 4)
        }
      >
        <MapResizer />
        <MapFocus focus={focus} />
        {onPick && <MapPicker onPick={onPick} />}
        <MapGeoJSON
          id="coverage-zones"
          data={areas}
          promoteId="id"
          interactive={Boolean(onZoneClick) && !onPick}
          fillPaint={{
            'fill-color': ['get', 'fill'],
            'fill-opacity': ['case', ['==', ['get', 'selected'], 1], 0.4, 0.22],
          }}
          linePaint={{
            'line-color': ['get', 'line'],
            'line-width': ['case', ['==', ['get', 'selected'], 1], 2.5, 1],
            'line-opacity': 0.8,
          }}
          onClick={(event) => {
            const id = event.feature.properties?.id
            if (typeof id === 'string') onZoneClick?.(id)
          }}
        />
        {labelled.map((s) => (
          <MapMarker
            key={`label-${s.zone.id}`}
            latitude={s.zone.lat}
            longitude={s.zone.lng}
          >
            <MarkerContent>
              <div
                aria-hidden
                onClick={() => !onPick && onZoneClick?.(s.zone.id)}
                className={cn(
                  // Above the centre, so the dots on it stay visible.
                  'pointer-events-auto -translate-y-5 cursor-pointer select-none text-center leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]',
                  s.zone.id === selectedZoneId ? 'text-white' : 'text-white/85'
                )}
              >
                <span className="block text-[11px] font-semibold">
                  {s.zone.name}
                </span>
                <span className="block font-numeric text-[10px]">
                  {s.live} / {s.zone.target}
                </span>
              </div>
            </MarkerContent>
          </MapMarker>
        ))}
        {dots.map((dot) => (
          <MapMarker key={dot.id} latitude={dot.lat} longitude={dot.lng}>
            <MarkerContent>
              <span
                title={dot.label}
                className={cn(
                  'block size-2.5 rounded-full ring-2 ring-black/60',
                  DOT_CLASS[dot.tone]
                )}
              />
            </MarkerContent>
          </MapMarker>
        ))}
        {rings.map((ring) => (
          <MapMarker key={ring.id} latitude={ring.lat} longitude={ring.lng}>
            <MarkerContent>
              <span
                title={ring.label}
                className={cn(
                  'block rounded-full border-2 border-tone-progress-dot',
                  ring.ticked
                    ? 'size-4 bg-tone-progress-dot'
                    : 'size-3.5 bg-black/30'
                )}
              />
            </MarkerContent>
          </MapMarker>
        ))}
      </Map>
    </div>
  )
}
