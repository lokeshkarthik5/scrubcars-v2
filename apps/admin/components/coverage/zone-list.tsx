'use client'

import Link from 'next/link'
import {
  IconChevronRight,
  IconFlame,
  IconStarFilled,
} from '@tabler/icons-react'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { StatTile } from '@repo/ui/sc/stat-tile'
import type { HotRule, ZoneDemand } from '@repo/core/api/admin-coverage'
import { cn } from '@repo/core/utils'
import {
  barParts,
  demandLine,
  hotRuleText,
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

/** "Hot", on a zone the API ranks among the top for demand. */
export function HotBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-tone-late-tint px-1.5 py-px text-[10.5px] font-semibold text-tone-late-text">
      <IconFlame size={11} aria-hidden />
      Hot
    </span>
  )
}

/**
 * The zone list beside the map (mockup A): the zones with the most demand
 * first (people waiting + requests nobody accepted; the API's score), each
 * with live against its target, the stacked bar, how many places are known
 * and its demand, Hot by the API's rule. Pressing a zone opens its call
 * list. The last row is everything in no zone.
 */
export function ZoneList({
  stats,
  demand,
  filter,
  onFilter,
  onOpen,
  outsideCount,
  selectedZoneId,
}: {
  stats: ZoneStats[]
  demand: Map<string, ZoneDemand>
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
          Zones, most demand first
        </h2>
        <ScSegmented
          size="sm"
          aria-label="Which zones"
          value={filter}
          onChange={onFilter}
          options={[
            { value: 'priority', label: 'Priority & Hot' },
            { value: 'all', label: 'All zones' },
          ]}
        />
      </div>
      <ul className="flex flex-col overflow-hidden rounded-[14px] border border-border bg-surface">
        {stats.map((s) => {
          const zoneDemand = demand.get(s.zone.id)
          const line = demandLine(zoneDemand)
          return (
            <li
              key={s.zone.id}
              className="border-b border-border last:border-b-0"
            >
              <button
                type="button"
                onClick={() => onOpen(s.zone.id)}
                aria-label={`${s.zone.name}: ${s.live} of ${s.zone.target} live, ${s.rows.length} known${zoneDemand?.hot ? ', hot' : ''}${line ? `, ${line}` : ''}. Open its call list`}
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
                    {zoneDemand?.hot && <HotBadge />}
                  </span>
                  <span className="block text-[11.5px] text-text-secondary">
                    Target {s.zone.target} · {s.rows.length} known
                  </span>
                  {line && (
                    <span className="block text-[11.5px] text-text-primary">
                      {line}
                    </span>
                  )}
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
          )
        })}
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
 * Under the zone list: what the demand figures are and what Hot means (in
 * the API's own numbers), and the way to every request. An API from before
 * part 3 sends no demand: then it says so.
 */
export function DemandKey({ hotRule }: { hotRule: HotRule | undefined }) {
  return (
    <section
      aria-label="Demand"
      className="rounded-[12px] border border-border px-3.5 py-3 text-[12px] text-text-secondary"
    >
      <h3 className="text-[12px] font-medium text-text-primary">Demand</h3>
      {hotRule ? (
        <>
          <p className="mt-0.5">
            Waiting: customers on a zone’s free-wash list. Requests: “Request a
            visit” or “Request a pickup” sent from it in the last{' '}
            {hotRule.requestDays} days; failed means nobody accepted.
          </p>
          <p className="mt-1">{hotRuleText(hotRule)}</p>
        </>
      ) : (
        <p className="mt-0.5">
          Demand per zone arrives with the API from this release.
        </p>
      )}
      <Link
        href="/requests"
        className="mt-1.5 inline-flex min-h-9 items-center text-[12px] font-medium text-text-primary underline underline-offset-4"
      >
        See every request
      </Link>
    </section>
  )
}
