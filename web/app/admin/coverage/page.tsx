'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { getDemandSupply, type DemandSupplyCell } from '@/lib/api/admin'
import { DEFAULT_CENTER, MAP_STYLES, MAP_THEME } from '@/lib/map'
import { cn } from '@/lib/utils'

/**
 * Where demand outruns supply — the recruiting map.
 *
 * Each square is a ~1 km cell holding a count of live garages and a count of
 * doorstep bookings. A cell with bookings and no garage means customers there
 * are being served from further away than they should be, which is exactly
 * where the next garage is worth signing up.
 *
 * Read honestly: with few bookings on the books this shows very little, and
 * that is the correct output rather than a broken one. It becomes useful as
 * booking volume arrives.
 */

const Map = dynamic(() => import('@/components/ui/map').then((m) => m.Map), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-surface" />,
})
const MapMarker = dynamic(
  () => import('@/components/ui/map').then((m) => m.MapMarker),
  { ssr: false }
)
const MarkerContent = dynamic(
  () => import('@/components/ui/map').then((m) => m.MarkerContent),
  { ssr: false }
)

export default function AdminCoveragePage() {
  const [cells, setCells] = useState<DemandSupplyCell[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDemandSupply()
      .then(setCells)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Could not load coverage')
      )
      .finally(() => setLoading(false))
  }, [])

  const gaps = useMemo(
    () => cells.filter((c) => c.gap > 0).sort((a, b) => b.gap - a.gap),
    [cells]
  )

  const center: [number, number] = cells.length
    ? [cells[0].lng, cells[0].lat]
    : DEFAULT_CENTER

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">
          Coverage &amp; demand
        </h1>
        <p className="mt-1 text-[12px] text-text-secondary">
          Roughly 1 km cells. Red means doorstep bookings with no garage in the
          cell — where to recruit next.
        </p>
      </div>

      {error && <p className="text-[13px] text-brand-red">{error}</p>}

      <div className="h-[420px] overflow-hidden rounded-[12px] border border-border">
        <Map
          className="h-full w-full"
          styles={MAP_STYLES}
          theme={MAP_THEME}
          center={center}
          zoom={11}
          attributionControl={false}
        >
          {cells.map((cell) => (
            <MapMarker
              key={`${cell.lat}-${cell.lng}`}
              latitude={cell.lat}
              longitude={cell.lng}
            >
              <MarkerContent>
                <span
                  className={cn(
                    'block rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold shadow',
                    cell.gap > 0
                      ? 'bg-brand-red text-brand-white'
                      : cell.vendorCount > 0
                        ? 'bg-success text-brand-black'
                        : 'bg-surface-elevated text-text-secondary'
                  )}
                  title={`${cell.vendorCount} garages · ${cell.bookingCount} bookings`}
                >
                  {cell.vendorCount}/{cell.bookingCount}
                </span>
              </MarkerContent>
            </MapMarker>
          ))}
        </Map>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-text-primary">
          Biggest gaps
        </h2>
        {loading ? (
          <p className="text-[13px] text-text-secondary">Loading…</p>
        ) : gaps.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            No cell has more doorstep bookings than garages yet. This fills in as
            booking volume arrives.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {gaps.slice(0, 20).map((cell) => (
              <li
                key={`${cell.lat}-${cell.lng}`}
                className="flex items-center justify-between rounded-[10px] border border-border bg-surface px-3 py-2 text-[13px]"
              >
                <span className="text-text-primary">
                  {cell.lat.toFixed(2)}, {cell.lng.toFixed(2)}
                </span>
                <span className="text-text-secondary">
                  {cell.bookingCount} booking{cell.bookingCount === 1 ? '' : 's'} ·{' '}
                  {cell.vendorCount} garage{cell.vendorCount === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
