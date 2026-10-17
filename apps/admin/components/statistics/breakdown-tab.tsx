'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconArrowDown, IconChevronDown, IconDownload, IconStar } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { Skeleton } from '@repo/ui/sc/skeleton'
import type { StatsBreakdown } from '@repo/core/api/admin'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { useStatsBreakdown } from '@repo/core/api/hooks/use-admin-stats'
import { cn } from '@repo/core/utils'
import { HowWeCount } from '@/components/statistics/how-we-count'
import { downloadCsv } from '@/lib/bookings'
import {
  breakdownCsv,
  busiestSlots,
  heatLevel,
  hourLabel,
  percent,
  plural,
  rupees,
  SERVICE_TYPE_LABELS,
  WEEKDAY_LABELS,
  type DateRange,
} from '@/lib/statistics'

/** How many garages show before "Show all". */
const TOP_GARAGES = 5

const HOW_WE_COUNT = [
  'The funnel and money go by the day the booking was made; busy hours by the day and time of the slot.',
  'A booking with two kinds of service counts under both, and its money is split between them by price.',
  'Ratings are each garage’s average over its reviews up to the end of the period.',
  'Bookings marked Test, and their checkouts, are left out.',
]

export function CardHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <h2 className="text-[15px] font-medium tracking-tight text-text-primary">{title}</h2>
      <p className="mt-0.5 text-[12px] text-text-secondary">{subtitle}</p>
    </>
  )
}

/** A bar as a share of its whole, on a faint track. */
export function ShareBar({ share, className }: { share: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn('overflow-hidden rounded-full bg-white/[0.06]', className)}>
      <i
        className="block h-full rounded-full bg-[#E4E4E7]"
        style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }}
      />
    </div>
  )
}

function Drop({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 py-2.5 pl-0.5 text-[12px] text-text-muted">
      <IconArrowDown size={14} aria-hidden="true" className="shrink-0" />
      <span>{children}</span>
    </p>
  )
}

function Step({
  label,
  count,
  note,
  share,
}: {
  label: string
  count: number
  note?: string
  share: number
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-text-primary">{label}</span>
        <span className="flex items-baseline gap-2.5">
          {note && <em className="not-italic text-[11px] text-text-muted">{note}</em>}
          <b className="font-numeric text-[17px] font-medium tabular-nums text-text-primary">
            {count.toLocaleString('en-IN')}
          </b>
        </span>
      </div>
      <ShareBar share={share} className="mt-2 h-2" />
    </div>
  )
}

function Funnel({ funnel }: { funnel: StatsBreakdown['funnel'] }) {
  const started = funnel.checkoutsStarted
  const of = (part: number) => (started > 0 ? part / started : 0)
  const after = [
    funnel.cancelled > 0 && plural(funnel.cancelled, 'cancelled', 'cancelled'),
    funnel.noShows > 0 && plural(funnel.noShows, 'no-show', 'no-shows'),
    funnel.notDone > 0 && `${funnel.notDone.toLocaleString('en-IN')} not marked done yet`,
  ].filter(Boolean)

  return (
    <ScCard className="px-4 py-4">
      <CardHeading title="Funnel" subtitle="From checkout to a finished job" />
      <div className="mt-4">
        <Step label="Checkout started" count={started} share={started > 0 ? 1 : 0} />
        <Drop>
          <span className="font-numeric font-medium text-text-secondary">
            {funnel.leftWithoutPaying.toLocaleString('en-IN')}
          </span>{' '}
          left without paying · {percent(started > 0 ? funnel.leftWithoutPaying / started : null)}
          {funnel.paidNoBooking > 0 && (
            <>
              {' '}
              ·{' '}
              <span className="font-numeric font-medium text-text-secondary">
                {funnel.paidNoBooking}
              </span>{' '}
              paid with no booking (refunds)
            </>
          )}
        </Drop>
        <Step
          label="Paid"
          count={funnel.paid}
          note={`${percent(funnel.paidOfStarted)} of started`}
          share={of(funnel.paid)}
        />
        <Drop>{after.length > 0 ? after.join(' · ') : 'None cancelled or still to come'}</Drop>
        <Step
          label="Completed"
          count={funnel.completed}
          note={`${percent(funnel.completedOfPaid)} of paid`}
          share={of(funnel.completed)}
        />
      </div>
    </ScCard>
  )
}

function Garages({ garages }: { garages: StatsBreakdown['garages'] }) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? garages : garages.slice(0, TOP_GARAGES)
  const totalBookings = garages.reduce((sum, g) => sum + g.bookings, 0)
  const totalCollected = garages.reduce((sum, g) => sum + g.collected, 0)
  const figure = 'text-right font-numeric tabular-nums text-text-primary'

  return (
    <ScCard className="px-4 pb-1.5 pt-4">
      <CardHeading title="By garage" subtitle="Most collected first" />
      {garages.length === 0 ? (
        <p className="py-4 text-[13px] text-text-secondary">No paid bookings in this period.</p>
      ) : (
        <table className="mt-3.5 w-full table-fixed border-collapse text-[13px]">
          <colgroup>
            <col />
            <col className="w-[72px]" />
            <col className="w-[96px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border text-[11px] text-text-muted">
              <th scope="col" className="pb-2 text-left font-medium">
                Garage
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                Bookings
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                Collected
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((garage) => (
              <tr key={garage.vendorId} className="border-b border-border last:border-b-0">
                <th scope="row" className="py-2.5 pr-2 text-left font-normal">
                  <span className="block leading-[18px] text-text-primary">{garage.name}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-[11px] text-text-muted">
                    {garage.rating === null ? (
                      'No ratings yet'
                    ) : (
                      <>
                        <IconStar size={11} aria-hidden="true" className="text-text-secondary" />
                        <span className="font-numeric">{garage.rating.toFixed(1)}</span>
                        <span className="sr-only">
                          {' '}
                          stars from {plural(garage.reviews, 'review', 'reviews')}
                        </span>
                      </>
                    )}
                  </span>
                </th>
                <td className={figure}>{garage.bookings.toLocaleString('en-IN')}</td>
                <td className={figure}>{rupees(garage.collected)}</td>
              </tr>
            ))}
          </tbody>
          {garages.length > 1 && (
            <tfoot>
              {garages.length > TOP_GARAGES && (
                <tr>
                  <td colSpan={3}>
                    <button
                      type="button"
                      aria-expanded={showAll}
                      onClick={() => setShowAll((all) => !all)}
                      className="flex min-h-11 items-center gap-1.5 text-[13px] text-text-secondary hover:text-text-primary"
                    >
                      {showAll ? `Show the top ${TOP_GARAGES}` : `Show all ${garages.length} garages`}
                      <IconChevronDown
                        size={15}
                        aria-hidden="true"
                        className={cn('text-text-muted transition-transform', showAll && 'rotate-180')}
                      />
                    </button>
                  </td>
                </tr>
              )}
              <tr className="border-t border-border">
                <th scope="row" className="py-2.5 text-left font-medium text-text-primary">
                  All {garages.length} garages
                </th>
                <td className={cn(figure, 'font-medium')}>{totalBookings.toLocaleString('en-IN')}</td>
                <td className={cn(figure, 'font-medium')}>{rupees(totalCollected)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </ScCard>
  )
}

function ServiceTypes({ services }: { services: StatsBreakdown['services'] }) {
  const most = Math.max(0, ...services.map((s) => s.collected))
  return (
    <ScCard className="px-4 py-4">
      <CardHeading title="By service type" subtitle="Collected after refunds" />
      <ul className="mt-4 flex flex-col gap-3.5">
        {services.map((service) => (
          <li key={service.category}>
            <div className="flex items-baseline justify-between gap-2.5 text-[13px]">
              <span className="text-text-primary">
                {SERVICE_TYPE_LABELS[service.category]}{' '}
                <em className="ml-1 not-italic text-[11px] text-text-muted">
                  {plural(service.bookings, 'booking', 'bookings')}
                </em>
              </span>
              <b className="font-numeric font-medium tabular-nums text-text-primary">
                {rupees(service.collected)}
              </b>
            </div>
            <ShareBar share={most > 0 ? service.collected / most : 0} className="mt-1.5 h-1.5" />
          </li>
        ))}
      </ul>
    </ScCard>
  )
}

const HEAT_SHADES = [
  'bg-white/[0.05]',
  'bg-white/[0.15]',
  'bg-white/[0.30]',
  'bg-white/[0.52]',
  'bg-white/[0.86]',
] as const

function BusyHours({ busy }: { busy: StatsBreakdown['busyHours'] }) {
  const hours = Array.from({ length: busy.lastHour - busy.firstHour + 1 }, (_, i) => busy.firstHour + i)
  const busiest = Math.max(0, ...busy.cells.map((cell) => cell.bookings))
  const top = busiestSlots(busy.cells)
  const peak = [...busy.cells].sort((a, b) => b.bookings - a.bookings)[0]
  const count = (weekday: number, hour: number) =>
    busy.cells.find((cell) => cell.weekday === weekday && cell.hour === hour)?.bookings ?? 0

  return (
    <ScCard className="px-4 py-4">
      <figure>
        <CardHeading
          title="Busiest hours"
          subtitle={
            peak && peak.bookings > 0
              ? `Bookings by slot time · busiest ${WEEKDAY_LABELS[peak.weekday - 1]} ${hourLabel(peak.hour)}`
              : 'Bookings by slot time'
          }
        />
        {busy.total === 0 ? (
          <p className="pt-4 text-[13px] text-text-secondary">No paid bookings with a slot in this period.</p>
        ) : (
          <>
            <div
              aria-hidden="true"
              className="mt-4 grid items-center gap-[3px]"
              style={{ gridTemplateColumns: `30px repeat(${hours.length}, minmax(0, 1fr))` }}
            >
              {WEEKDAY_LABELS.map((day, i) => (
                <div key={day} className="contents">
                  <span className="text-[11px] text-text-muted">{day}</span>
                  {hours.map((hour) => {
                    const bookings = count(i + 1, hour)
                    return (
                      <i
                        key={hour}
                        title={`${day} ${hourLabel(hour)}: ${bookings}`}
                        className={cn('block h-[17px] rounded-[3px]', HEAT_SHADES[heatLevel(bookings, busiest)])}
                      />
                    )
                  })}
                </div>
              ))}
              <span />
              {hours.map((hour) => (
                <span key={hour} className="mt-1 justify-self-center whitespace-nowrap text-[10.5px] text-text-muted">
                  {hour % 4 === 0 ? hourLabel(hour) : ''}
                </span>
              ))}
            </div>
            <div aria-hidden="true" className="mt-3 flex items-center justify-end gap-[3px] text-[11px] text-text-muted">
              <span className="mr-1.5">Fewer</span>
              {HEAT_SHADES.map((shade) => (
                <i key={shade} className={cn('block h-2.5 w-3.5 rounded-[2px]', shade)} />
              ))}
              <span className="ml-1.5">More</span>
            </div>
            <figcaption className="sr-only">
              {plural(busy.total, 'paid booking', 'paid bookings')} by slot. Busiest: {top.join(', ')}.
            </figcaption>
          </>
        )}
      </figure>
    </ScCard>
  )
}

/**
 * The Breakdown tab: the funnel from checkout to a finished job, garages,
 * service types and the busiest hours, and the lot as a CSV.
 */
export function BreakdownTab({ range, vendorId }: { range: DateRange; vendorId: string }) {
  const router = useRouter()
  const stats = useStatsBreakdown({ ...range, vendorId: vendorId || undefined })

  useEffect(() => {
    if (isAuthError(stats.error)) router.replace('/login')
  }, [stats.error, router])

  if (!stats.data) {
    return stats.isError ? (
      <ErrorState
        message={errorMessage(stats.error, "Couldn't load the breakdown.")}
        onRetry={() => void stats.refetch()}
      />
    ) : (
      <div role="status" aria-busy="true" className="flex flex-col gap-5">
        <span className="sr-only">Loading</span>
        <Skeleton className="h-[290px]" />
        <Skeleton className="h-[400px]" />
        <Skeleton className="h-[330px]" />
      </div>
    )
  }

  const breakdown = stats.data
  return (
    <>
      <div
        aria-busy={stats.isFetching || undefined}
        className={cn('flex flex-col gap-5 transition-opacity', stats.isPlaceholderData && 'opacity-60')}
      >
        <Funnel funnel={breakdown.funnel} />
        <Garages key={`${range.from}:${range.to}:${vendorId}`} garages={breakdown.garages} />
        <ServiceTypes services={breakdown.services} />
        <BusyHours busy={breakdown.busyHours} />
      </div>
      <ScButton
        variant="secondary"
        className="flex min-h-12 items-center justify-center gap-2"
        disabled={stats.isPlaceholderData}
        onClick={() =>
          downloadCsv(
            breakdownCsv(breakdown),
            `detlio-statistics-${breakdown.range.from}-to-${breakdown.range.to}.csv`
          )
        }
      >
        <IconDownload size={16} aria-hidden="true" className="text-text-secondary" />
        Download CSV
      </ScButton>
      <HowWeCount lines={HOW_WE_COUNT} />
    </>
  )
}
