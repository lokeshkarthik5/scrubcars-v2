'use client'

import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { ScCard } from '@repo/ui/sc/card'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { Skeleton } from '@repo/ui/sc/skeleton'
import type { StatsKpis, StatsOverview } from '@repo/core/api/admin'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { useStatsOverview } from '@repo/core/api/hooks/use-admin-stats'
import { cn } from '@repo/core/utils'
import { PilotNumbersCard } from '@/components/pilot-numbers-card'
import { CertificateSharesCard } from '@/components/statistics/certificate-shares-card'
import { HowWeCount } from '@/components/statistics/how-we-count'
import {
  busiestWeekday,
  change,
  dayLabel,
  percent,
  plural,
  rangeLabel,
  rupees,
  type DateRange,
} from '@/lib/statistics'

// The chart library loads with the first chart on this page, never with the
// rest of the panel, as the Coverage map does.
const chartLoading = () => (
  <Skeleton className="mt-3.5 h-[170px] rounded-[10px]" />
)
const BookingsPerDayChart = dynamic(
  () =>
    import('@/components/statistics/charts').then((m) => m.BookingsPerDayChart),
  { ssr: false, loading: chartLoading }
)
const CollectedChart = dynamic(
  () => import('@/components/statistics/charts').then((m) => m.CollectedChart),
  { ssr: false, loading: chartLoading }
)

const HOW_WE_COUNT = [
  'Days are India days. A booking counts on the day it was made, once it is paid.',
  'A booking moved to another slot is still one booking.',
  'Collected after refunds is what customers paid, final bills included, less the refunds recorded on the Refunds page.',
  'Every tap on Pay is a checkout started, so one customer trying twice counts twice.',
  'Commission counts once a job is done, and recent bookings have had less time to be cancelled, so a period ending today reads low on both until its jobs play out. Their changes are shown in grey, not as good or bad news.',
  'Bookings marked Test are left out.',
]

type Change = ReturnType<typeof change>

/** One of the six figures, with how it moved since the period before. */
function KpiTile({
  label,
  value,
  delta,
  was,
  note,
}: {
  label: string
  value: string
  delta?: Change
  /** The earlier figure, shown when comparing. */
  was?: string
  /** A caveat under the comparison, in plain words. */
  note?: string
}) {
  return (
    <div className="min-w-0 rounded-[14px] border border-border bg-surface px-3.5 py-3">
      <p className="text-[11px] font-medium text-text-secondary">{label}</p>
      <p className="mt-1 truncate font-numeric text-[24px] font-medium leading-[30px] tracking-tight text-text-primary">
        {value}
      </p>
      {was !== undefined && (
        <p className="mt-0.5 flex gap-1.5 whitespace-nowrap text-[11px] text-text-muted">
          {delta && (
            <b
              className={cn(
                'font-numeric font-medium',
                delta.good === true && 'text-success',
                delta.good === false && 'text-warning',
                delta.good === null && 'text-text-secondary'
              )}
            >
              {delta.direction === 'same' ? (
                delta.text
              ) : (
                <>
                  <span aria-hidden="true">
                    {delta.direction === 'up' ? '↑' : '↓'}{' '}
                  </span>
                  <span className="sr-only">
                    {delta.direction === 'up' ? 'Up' : 'Down'}{' '}
                  </span>
                  {delta.text}
                </>
              )}
            </b>
          )}
          <span>
            was <span className="font-numeric">{was}</span>
          </span>
        </p>
      )}
      {was !== undefined && note && (
        <p className="mt-0.5 text-[11px] leading-[15px] text-text-muted">
          {note}
        </p>
      )}
    </div>
  )
}

/**
 * A change on a figure the latest days have not finished filling in, shown
 * without calling it good or bad: commission comes only once a job is done,
 * and recent bookings have had less time to be cancelled, so against a
 * settled period before, a period ending today reads low on both even when
 * business is flat.
 */
function unsettled(delta: Change): Change {
  return delta && { ...delta, good: null }
}

function Tiles({
  kpis,
  previous,
  endsToday,
}: {
  kpis: StatsKpis
  previous: StatsKpis | null
  /** The period runs to today, so its last days are still playing out. */
  endsToday: boolean
}) {
  const was = (format: (k: StatsKpis) => string) =>
    previous ? format(previous) : undefined
  const settle = (delta: Change) => (endsToday ? unsettled(delta) : delta)
  const average = (k: StatsKpis) =>
    k.averageBooking === null ? '–' : rupees(k.averageBooking)

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <KpiTile
        label="Bookings"
        value={kpis.bookings.toLocaleString('en-IN')}
        delta={previous && change(kpis.bookings, previous.bookings, 'amount')}
        was={was((k) => k.bookings.toLocaleString('en-IN'))}
      />
      <KpiTile
        label="Collected after refunds"
        value={rupees(kpis.collected)}
        delta={previous && change(kpis.collected, previous.collected, 'amount')}
        was={was((k) => rupees(k.collected))}
      />
      <KpiTile
        label="Detlio commission"
        value={rupees(kpis.commission)}
        delta={
          previous &&
          settle(change(kpis.commission, previous.commission, 'amount'))
        }
        was={was((k) => rupees(k.commission))}
        note={endsToday ? 'Low until recent jobs are done' : undefined}
      />
      <KpiTile
        label="Average booking"
        value={average(kpis)}
        delta={
          previous &&
          change(kpis.averageBooking, previous.averageBooking, 'amount')
        }
        was={was(average)}
      />
      <KpiTile
        label="Checkout → paid"
        value={percent(kpis.paidOfStarted)}
        delta={
          previous && change(kpis.paidOfStarted, previous.paidOfStarted, 'rate')
        }
        was={was((k) => percent(k.paidOfStarted))}
      />
      <KpiTile
        label="Cancellations"
        value={percent(kpis.cancellationRate, 1)}
        delta={
          previous &&
          settle(
            change(
              kpis.cancellationRate,
              previous.cancellationRate,
              'rate',
              'down',
              1
            )
          )
        }
        was={was((k) => percent(k.cancellationRate, 1))}
        note={endsToday ? 'Recent bookings can still cancel' : undefined}
      />
    </div>
  )
}

/** The card a chart sits in: a title, a one-line summary, the chart, and what it says in words. */
function ChartCard({
  title,
  subtitle,
  summary,
  children,
  foot,
}: {
  title: string
  subtitle: string
  /** The chart in a sentence, for a screen reader. */
  summary: string
  children: React.ReactNode
  foot?: string
}) {
  return (
    <ScCard className="px-4 py-4">
      <figure>
        <h2 className="text-[15px] font-medium tracking-tight text-text-primary">
          {title}
        </h2>
        <p className="mt-0.5 text-[12px] text-text-secondary">{subtitle}</p>
        {/* Drawn for the eye; the caption says the same for a screen reader. */}
        <div aria-hidden="true">{children}</div>
        <figcaption className="sr-only">{summary}</figcaption>
        {foot && <p className="mt-2.5 text-[11px] text-text-muted">{foot}</p>}
      </figure>
    </ScCard>
  )
}

function PerDay({
  overview,
  periodName,
  previousName,
}: {
  overview: StatsOverview
  periodName: string
  previousName: string
}) {
  const days = overview.perDay
  const total = days.reduce((sum, day) => sum + day.bookings, 0)
  const average = days.length > 0 ? total / days.length : 0
  const busiest = busiestWeekday(days)
  const peak = days.reduce(
    (top, day) => (day.bookings > top.bookings ? day : top),
    days[0]
  )
  const previous = overview.previousPerDay
  const previousTotal =
    previous?.reduce((sum, day) => sum + day.bookings, 0) ?? null

  const summary = [
    `${plural(total, 'booking', 'bookings')} over ${plural(days.length, 'day', 'days')}, ${average.toFixed(1)} a day on average.`,
    peak && peak.bookings > 0
      ? `The most in a day: ${peak.bookings}, on ${dayLabel(peak.date)}.`
      : '',
    previousTotal !== null
      ? `${previousName}: ${plural(previousTotal, 'booking', 'bookings')}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <ChartCard
      title="Bookings per day"
      subtitle={`${average.toFixed(1)} a day on average${busiest ? ` · most on ${busiest}` : ''}`}
      summary={summary}
    >
      {previous && (
        <div className="mt-3 flex gap-4 text-[11px] text-text-secondary">
          <span className="flex items-center gap-1.5">
            <i className="block h-0.5 w-3.5 rounded-full bg-[#E4E4E7]" />
            {periodName}
          </span>
          <span className="flex items-center gap-1.5">
            <i className="block h-0.5 w-3.5 rounded-full bg-[#5C5C68]" />
            {previousName}
          </span>
        </div>
      )}
      <div className="mt-3.5">
        <BookingsPerDayChart current={days} previous={previous} />
      </div>
    </ChartCard>
  )
}

function Collected({ overview }: { overview: StatsOverview }) {
  const { unit, bars } = overview.collected
  const part = bars.filter((bar) => !bar.full)
  const word = unit === 'week' ? 'week' : 'month'
  const foot =
    part.length > 0
      ? `Dimmer bars are part ${word}s: ${part.map((bar) => rangeLabel({ from: bar.start, to: bar.end })).join(' and ')}.`
      : undefined
  const summary = bars
    .map(
      (bar) =>
        `${rangeLabel({ from: bar.start, to: bar.end })}${bar.full ? '' : ` (part ${word})`}: ${rupees(bar.collected)}`
    )
    .join('; ')

  return (
    <ChartCard
      title={unit === 'week' ? 'Collected per week' : 'Collected per month'}
      subtitle={
        unit === 'week'
          ? 'After refunds · weeks start on Monday'
          : 'After refunds · calendar months'
      }
      summary={`Collected after refunds. ${summary}.`}
      foot={foot}
    >
      <div className="mt-3.5">
        <CollectedChart bars={bars} unit={unit} />
      </div>
    </ChartCard>
  )
}

/**
 * The Overview tab: the six figures with how each moved, bookings per day
 * and collected per week, then the pilot's numbers (moved here from the
 * Vendors page) and how it is all counted.
 */
export function OverviewTab({
  range,
  vendorId,
  compare,
  endsToday,
  periodName,
  previousName,
}: {
  range: DateRange
  vendorId: string
  compare: boolean
  /** The period runs to today (every preset but Last month). */
  endsToday: boolean
  /** "Last 30 days": the chart legend's name for this period. */
  periodName: string
  /** "Previous 30 days", or the month before. */
  previousName: string
}) {
  const router = useRouter()
  const stats = useStatsOverview({
    ...range,
    vendorId: vendorId || undefined,
    compare,
  })

  // A dead admin session is a redirect, not an error message.
  useEffect(() => {
    if (isAuthError(stats.error)) router.replace('/login')
  }, [stats.error, router])

  return (
    <>
      {stats.data ? (
        <div
          aria-busy={stats.isFetching || undefined}
          className={cn(
            'flex flex-col gap-5 transition-opacity',
            stats.isPlaceholderData && 'opacity-60'
          )}
        >
          <Tiles
            kpis={stats.data.kpis}
            previous={stats.data.previousKpis}
            endsToday={endsToday}
          />
          <PerDay
            overview={stats.data}
            periodName={periodName}
            previousName={previousName}
          />
          <Collected overview={stats.data} />
        </div>
      ) : stats.isError ? (
        <ErrorState
          message={errorMessage(stats.error, "Couldn't load the statistics.")}
          onRetry={() => void stats.refetch()}
        />
      ) : (
        <div role="status" aria-busy="true" className="flex flex-col gap-5">
          <span className="sr-only">Loading</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[92px]" />
            ))}
          </div>
          <Skeleton className="h-[260px]" />
          <Skeleton className="h-[230px]" />
        </div>
      )}

      {/* The pilot's own card, with its 7 / 30 day windows, as it was on Vendors. */}
      <PilotNumbersCard />
      {/* Service History certificates shared and opened (0053), all time. */}
      <CertificateSharesCard />
      <HowWeCount lines={HOW_WE_COUNT} />
    </>
  )
}
