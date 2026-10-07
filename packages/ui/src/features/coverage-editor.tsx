'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { IconTrash } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import {
  closeRing,
  getDoorstepArea,
  setDoorstepArea,
  type CoverageRing,
} from '@repo/core/api/coverage'
import { DEFAULT_CENTER, MAP_STYLES, MAP_THEME } from '@repo/core/map'
import { toast } from 'react-toastify'

/**
 * Draw the area a garage will travel to for doorstep work.
 *
 * Exists because a radius is the wrong shape for real coverage: a garage with a
 * river, a highway or a city boundary on one side will drive 15 km one way and
 * refuse 3 km the other. The radius stays as the default — this is the override
 * for the garages that need it, so onboarding is still one number rather than a
 * drawing exercise.
 */

const Map = dynamic(() => import('@repo/ui/sc/map').then((m) => m.Map), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-surface" />,
})
const MapGeoJSON = dynamic(
  () => import('@repo/ui/sc/map').then((m) => m.MapGeoJSON),
  { ssr: false }
)
const MapMarker = dynamic(
  () => import('@repo/ui/sc/map').then((m) => m.MapMarker),
  { ssr: false }
)
const MarkerContent = dynamic(
  () => import('@repo/ui/sc/map').then((m) => m.MarkerContent),
  { ssr: false }
)
const MapController = dynamic(
  () => import('@repo/ui/features/map-controller').then((m) => m.MapController),
  { ssr: false }
)

interface CoverageEditorProps {
  /** The garage's own pin, so the map opens where the garage actually is. */
  center?: { lat: number; lng: number } | null
  /** Shown when no polygon is drawn, to explain what applies instead. */
  fallbackRadiusKm?: number | null
}

export function CoverageEditor({ center, fallbackRadiusKm }: CoverageEditorProps) {
  /** Points as tapped, without the closing repeat — that is added on save. */
  const [points, setPoints] = useState<CoverageRing>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDoorstepArea()
      .then((area) => {
        // Drop the repeated closing point for editing, so tapping "undo" does
        // not appear to do nothing on the first press.
        if (area.ring && area.ring.length > 3) {
          setPoints(area.ring.slice(0, -1))
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [])

  const addPoint = useCallback((lat: number, lng: number) => {
    setPoints((current) => [...current, [lng, lat]])
  }, [])

  // Only renderable as an area once it is a triangle or better.
  const polygon = useMemo(() => {
    if (points.length < 3) return null
    return {
      type: 'Feature' as const,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [closeRing(points)],
      },
      properties: {},
    }
  }, [points])

  const save = async () => {
    setSaving(true)
    try {
      await setDoorstepArea(points.length >= 3 ? closeRing(points) : null)
      toast.success(
        points.length >= 3 ? 'Coverage area saved' : 'Coverage area cleared'
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the area')
    } finally {
      setSaving(false)
    }
  }

  const mapCenter: [number, number] = center
    ? [center.lng, center.lat]
    : DEFAULT_CENTER

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-text-muted">
        {points.length === 0
          ? fallbackRadiusKm
            ? `Tap the map to draw the area you travel to. Until you do, your ${fallbackRadiusKm} km radius applies.`
            : 'Tap the map to draw the area you travel to.'
          : points.length < 3
            ? `${points.length} of 3 corners — an area needs at least three.`
            : `${points.length} corners. Tap to add more, or save.`}
      </p>

      <div className="relative h-64 overflow-hidden rounded-[12px] border border-border">
        <Map
          className="h-full w-full"
          styles={MAP_STYLES}
          theme={MAP_THEME}
          center={mapCenter}
          zoom={12}
          attributionControl={false}
        >
          <MapController onMapClick={addPoint} />

          {polygon && (
            <MapGeoJSON
              data={polygon}
              fillPaint={{ 'fill-color': '#E23744', 'fill-opacity': 0.18 }}
              linePaint={{ 'line-color': '#E23744', 'line-width': 2 }}
            />
          )}

          {/* Corners stay visible as handles even once the fill is drawn, so it
              is obvious what a tap added and what "undo" will remove. */}
          {points.map((point, index) => (
            <MapMarker
              key={`${point[0]}-${point[1]}-${index}`}
              longitude={point[0]}
              latitude={point[1]}
            >
              <MarkerContent>
                <span className="block h-2.5 w-2.5 rounded-full border-2 border-brand-white bg-brand-red shadow" />
              </MarkerContent>
            </MapMarker>
          ))}

          {center && (
            <MapMarker longitude={center.lng} latitude={center.lat}>
              <MarkerContent>
                <span className="block h-3 w-3 rounded-full border-2 border-brand-white bg-text-primary shadow" />
              </MarkerContent>
            </MapMarker>
          )}
        </Map>
      </div>

      <div className="flex gap-2">
        <ScButton
          variant="secondary"
          fullWidth={false}
          disabled={points.length === 0}
          onClick={() => setPoints((current) => current.slice(0, -1))}
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 px-3 py-2 text-[12px]"
        >
          Undo corner
        </ScButton>
        <ScButton
          variant="secondary"
          fullWidth={false}
          disabled={points.length === 0}
          onClick={() => setPoints([])}
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 px-3 py-2 text-[12px]"
        >
          <IconTrash size={14} aria-hidden="true" />
          Clear
        </ScButton>
      </div>

      {/* Secondary: it sits under the Location tab's own Save location,
          which is that tab's one red. */}
      <ScButton
        variant="secondary"
        disabled={saving || loading || (points.length > 0 && points.length < 3)}
        onClick={save}
      >
        {saving
          ? 'Saving…'
          : points.length >= 3
            ? 'Save coverage area'
            : 'Clear area and use radius'}
      </ScButton>
    </div>
  )
}
