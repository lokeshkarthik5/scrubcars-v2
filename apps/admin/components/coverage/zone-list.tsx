'use client'

import { IconChevronRight, IconStarFilled } from '@tabler/icons-react'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { StatTile } from '@repo/ui/sc/stat-tile'
import { cn } from '@repo/core/utils'
import {
  barParts,
  ZONE_COLOUR_LABELS,
  ZONE_PAINT,
  type ZoneStats,
} from '@/lib/coverage'

/** The stacked bar: onboarded (green), to target (amber), not interested (red). */
export function ZoneBar({
  stats,
  className,
}: {
  stats: Pick<ZoneStats, 'live' | 'toTarget' | 'notInterested' | 'rows'>
  className?: string
}) {
  const parts = barParts(stats)
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-1.5 overflow-hidden rounded-full bg-white/10',
        className
      )}
    >
      <span
        className="h-full bg-tone-done-dot"
        style={{ width: `${parts.onboarded}%` }}
      />
      <span
        className="h-full bg-tone-attention-dot"
        style={{ width: `${parts.toTarget}%` }}
      />
      <span
        className="h-full bg-tone-late-dot"
        style={{ width: `${parts.notInterested}%` }}
      />
    </span>
  )
}

/** The figures across the top (mockup A): priority zones, onboarded, to target, not interested. */
export function CoverageTotals({
  totals,
}: {
  totals: {
    priorityZones: number
    onboarded: number
    toTarget: number
    notInterested: number
  }
}) {
  return (
    <section
      aria-label="Totals"
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      <StatTile label="Priority zones" value={totals.priorityZones} />
      <StatTile label="Onboarded" value={totals.onboarded} tone="success" />
      <StatTile label="To target" value={totals.toTarget} tone="warning" />
      <StatTile label="Not interested" value={totals.notInterested} />
    </section>
  )
}

/**
 * The zone list beside the map (mockup A): priority first, each with live
 * against its target, the stacked bar and how many places are known.
 * Pressing a zone opens its call list. The last row is everything in no
 * zone. Demand per zone joins each row once customer reach part 2 is live
 * (the `demand` slot under the list keeps its place).
 */
export function ZoneList({
  stats,
  filter,
  onFilter,
  onOpen,
  outsideCount,
  selectedZoneId,
}: {
  stats: ZoneStats[]
  filter: 'priority' | 'all'
  onFilter: (filter: 'priority' | 'all') => void
  onOpen: (zoneId: string | null) => void
  outsideCount: number
  selectedZoneId: string | null | undefined
}) {
  return (
    <section aria-label="Zones" className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[12.5px] text-text-secondary">
          Zones, priority first
        </h2>
        <ScSegmented
          size="sm"
          aria-label="Which zones"
          value={filter}
          onChange={onFilter}
          options={[
            { value: 'priority', label: 'Priority' },
            { value: 'all', label: 'All zones' },
          ]}
        />
      </div>
      <ul className="flex flex-col overflow-hidden rounded-[14px] border border-border bg-surface">
        {stats.map((s) => (
          <li
            key={s.zone.id}
            className="border-b border-border last:border-b-0"
          >
            <button
              type="button"
              onClick={() => onOpen(s.zone.id)}
              aria-label={`${s.zone.name}: ${s.live} of ${s.zone.target} live, ${s.rows.length} known. Open its call list`}
              aria-current={selectedZoneId === s.zone.id ? 'true' : undefined}
              className={cn(
                'grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3.5 py-3 text-left transition-colors hover:bg-white/[0.03] sm:grid-cols-[auto_minmax(0,10rem)_1fr_auto]',
                selectedZoneId === s.zone.id && 'bg-white/[0.05]'
              )}
            >
              <span
                className={cn(
                  'size-2.5 rounded-[3px]',
                  ZONE_PAINT[s.colour].dot
                )}
                title={ZONE_COLOUR_LABELS[s.colour]}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1 truncate text-[13.5px] font-medium text-text-primary">
                  {s.zone.name}
                  {s.zone.priority && (
                    <IconStarFilled
                      size={11}
                      aria-hidden
                      className="shrink-0 text-tone-attention-dot"
                    />
                  )}
                </span>
                <span className="block text-[11.5px] text-text-secondary">
                  Target {s.zone.target} · {s.rows.length} known
                </span>
              </span>
              <ZoneBar
                stats={s}
                className="col-span-3 col-start-1 row-start-2 sm:col-span-1 sm:col-start-3 sm:row-start-1"
              />
              <span className="flex items-center gap-1 font-numeric text-[13px] text-text-primary">
                {s.live} / {s.zone.target}
                <IconChevronRight
                  size={14}
                  aria-hidden
                  className="text-text-muted"
                />
              </span>
            </button>
          </li>
        ))}
        {stats.length === 0 && (
          <li className="px-3.5 py-4 text-[12.5px] text-text-secondary">
            No zones to show.
          </li>
        )}
        {outsideCount > 0 && (
          <li>
            <button
              type="button"
              onClick={() => onOpen(null)}
              aria-current={selectedZoneId === null ? 'true' : undefined}
              className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left text-[12.5px] text-text-secondary hover:bg-white/[0.03]"
            >
              <span>
                Not in a zone ·{' '}
                <span className="font-numeric">{outsideCount}</span> (no pin, or
                outside every zone)
              </span>
              <IconChevronRight
                size={14}
                aria-hidden
                className="text-text-muted"
              />
            </button>
          </li>
        )}
      </ul>
    </section>
  )
}

/**
 * Where demand per zone will go (people waiting, requests, recommended
 * garages, free washes): it needs customer reach part 2, not built yet.
 */
export function DemandPlaceholder({ zoneName }: { zoneName?: string }) {
  return (
    <section
      aria-label="Demand"
      className="rounded-[12px] border border-dashed border-border px-3.5 py-3 text-[12px] text-text-secondary"
    >
      <h3 className="text-[12px] font-medium text-text-primary">
        Demand{zoneName ? ` in ${zoneName}` : ''}
      </h3>
      <p className="mt-0.5">
        People waiting, requests and recommended garages show here once customer
        reach part 2 is live.
      </p>
    </section>
  )
}
