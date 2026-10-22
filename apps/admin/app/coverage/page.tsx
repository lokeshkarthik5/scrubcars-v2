'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { IconAlertCircle } from '@tabler/icons-react'
import { ScCard } from '@repo/ui/sc/card'
import { PageHeader } from '@repo/ui/sc/page-header'
import { Reveal } from '@repo/ui/sc/reveal'
import { SectionHeader } from '@repo/ui/sc/section-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { getDemandSupply, type DemandSupplyCell } from '@repo/core/api/admin'
import { DEFAULT_CENTER, MAP_STYLES, MAP_THEME } from '@repo/core/map'
import { cn } from '@repo/core/utils'

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

const Map = dynamic(() => import('@repo/ui/sc/map').then((m) => m.Map), {
  ssr: false,
  // The same shimmer as every other placeholder in the product.
  loading: () => <div className="h-full w-full shimmer" />,
})
const MapMarker = dynamic(
  () => import('@repo/ui/sc/map').then((m) => m.MapMarker),
  { ssr: false }
)
const MarkerContent = dynamic(
  () => import('@repo/ui/sc/map').then((m) => m.MarkerContent),
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
    // No padding of its own: the panel's shell already sets the page's edge,
    // and this page used to add a second one inside it.
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Coverage & demand"
        subtitle="Roughly 1 km cells, garages / doorstep bookings in each. Amber means more doorstep bookings than garages in the cell — where to recruit next."
      />

      {/* Amber, as errors are everywhere. */}
      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-[13px] text-error">
          <IconAlertCircle size={16} className="mt-px shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="h-[420px] overflow-hidden rounded-[14px] border border-border">
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
                {/* A gap is amber — a problem to act on — not red, which
                    is kept for things to press. */}
                <span
                  className={cn(
                    'block rounded-[4px] px-1.5 py-0.5 font-numeric text-[11px] font-semibold shadow',
                    cell.gap > 0
                      ? 'bg-warning text-brand-black'
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

      <section className="flex flex-col gap-3">
        <SectionHeader title="Biggest gaps" />
        {loading ? (
          <SkeletonList count={3} itemClassName="h-12 rounded-[12px]" />
        ) : gaps.length === 0 ? (
          <ScCard>
            <p className="text-[13px] text-text-secondary">
              No cell has more doorstep bookings than garages yet. This fills in as
              booking volume arrives.
            </p>
          </ScCard>
        ) : (
          <ul className="flex flex-col gap-2">
            {gaps.slice(0, 20).map((cell, i) => (
              <Reveal
                as="li"
                key={`${cell.lat}-${cell.lng}`}
                index={i}
                className="flex items-center justify-between gap-3 rounded-[12px] border border-border bg-surface px-3.5 py-3 text-[13px]"
              >
                <span className="font-numeric text-text-primary">
                  {cell.lat.toFixed(2)}, {cell.lng.toFixed(2)}
                </span>
                <span className="text-text-secondary">
                  <span className="font-numeric">{cell.bookingCount}</span> booking
                  {cell.bookingCount === 1 ? '' : 's'} ·{' '}
                  <span className="font-numeric">{cell.vendorCount}</span> garage
                  {cell.vendorCount === 1 ? '' : 's'}
                </span>
              </Reveal>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
