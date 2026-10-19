'use client'

import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { IconArrowDown, IconInfoCircle } from '@tabler/icons-react'
import { ScCard } from '@repo/ui/sc/card'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { Skeleton } from '@repo/ui/sc/skeleton'
import type { StatsFunnelMode, StatsFunnelReport } from '@repo/core/api/admin'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { useStatsFunnel } from '@repo/core/api/hooks/use-admin-stats'
import { cn } from '@repo/core/utils'
import { CardHeading, ShareBar } from '@/components/statistics/breakdown-tab'
import { HowWeCount } from '@/components/statistics/how-we-count'
import {
  biggestDropLine,
  DEVICE_LABELS,
  eventsStartNote,
  percent,
  plural,
  rangeLabel,
  returnWindowLine,
  SERVICE_TYPE_LABELS,
  type DateRange,
} from '@/lib/statistics'

// The chart library loads with this tab's chart, never with the rest of the
// panel, as on the other tabs.
const NewRepeatChart = dynamic(
  () => import('@/components/statistics/charts').then((m) => m.NewRepeatChart),
  {
    ssr: false,
    loading: () => <Skeleton className="mt-3.5 h-[160px] rounded-[10px]" />,
  }
)

const HOW_WE_COUNT = [
  'Visits and their steps come from Detlio’s own usage events, sent by the customer app: no cookies and no third party. A visit is one browser tab, from opening Detlio to closing it.',
  'Each step counts the visits that did it at least once. Paid counts bookings paid in the period, recorded by the API when the payment lands, so it does not depend on the customer’s browser.',
  'Browsers set to Do Not Track or Global Privacy Control send nothing, but their payments still count as paid, so the last step can read a little high. Payments with Razorpay’s test keys are left out.',
  'A booking type keeps only the steps that say one: the garage page, checkout, slot, Pay and paid. Visits and devices are every visit.',
  'Returning customers and new against repeat come from bookings, not events, for every booking type, with bookings marked Test left out. A booking counts once its payment landed.',
  'Usage events are kept for 180 days.',
]

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 rounded-[14px] border border-border bg-surface px-3.5 py-3 text-[12px] leading-[1.45] text-text-secondary">
      <IconInfoCircle
        size={18}
        aria-hidden="true"
        className="mt-px shrink-0 text-text-secondary"
      />
      <span>{children}</span>
    </p>
  )
}

function Funnel({ funnel }: { funnel: StatsFunnelReport['funnel'] }) {
  const visits = funnel.steps[0]?.count ?? 0
  const drop = funnel.biggestDrop
  const dropLine = biggestDropLine(funnel)

  return (
    <ScCard className="px-4 py-4">
      <CardHeading title="Funnel" subtitle="From a visit to a paid booking" />
      <ol className="mt-4 flex flex-col">
        {funnel.steps.map((step, i) => {
          const isDrop = drop?.key === step.key
          return (
            <li key={step.key}>
              {i > 0 && (
                <p
                  className={cn(
                    'flex items-center gap-2 py-2 pl-0.5 text-[12px]',
                    isDrop ? 'font-medium text-warning' : 'text-text-muted'
                  )}
                >
                  <IconArrowDown
                    size={14}
                    aria-hidden="true"
                    className="shrink-0"
                  />
                  <span>
                    {percent(step.ofPrevious)} went on
                    {isDrop && <> · biggest drop</>}
                  </span>
                </p>
              )}
              <div
                className={cn(
                  '-mx-2 rounded-[10px] px-2 py-1.5',
                  isDrop && 'border border-warning/40 bg-warning-muted'
                )}
              >
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-text-primary">{step.label}</span>
                  <span className="flex items-baseline gap-2.5">
                    {i > 0 && (
                      <em className="not-italic text-[12px] text-text-muted">
                        {percent(step.ofVisits, 1)} of visits
                      </em>
                    )}
                    <b className="font-numeric text-[17px] font-medium tabular-nums text-text-primary">
                      {step.count.toLocaleString('en-IN')}
                    </b>
                  </span>
                </div>
                <ShareBar
                  share={visits > 0 ? step.count / visits : 0}
                  className="mt-2 h-2"
                />
              </div>
            </li>
          )
        })}
      </ol>
      {dropLine && <p className="sr-only">{dropLine}</p>}
    </ScCard>
  )
}

function Categories({
  categories,
}: {
  categories: StatsFunnelReport['categories']
}) {
  const most = Math.max(0, ...categories.map((c) => c.visits))
  return (
    <ScCard className="px-4 py-4">
      <CardHeading
        title="Categories browsed"
        subtitle="Visits that picked each one on the list or in search"
      />
      {most === 0 ? (
        <p className="pt-4 text-[13px] text-text-secondary">
          No category picked in this period.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3.5">
          {categories.map((row) => (
            <li key={row.category}>
              <div className="flex items-baseline justify-between gap-2.5 text-[13px]">
                <span className="text-text-primary">
                  {SERVICE_TYPE_LABELS[row.category]}
                </span>
                <b className="font-numeric font-medium tabular-nums text-text-primary">
                  {row.visits.toLocaleString('en-IN')}
                </b>
              </div>
              <ShareBar
                share={most > 0 ? row.visits / most : 0}
                className="mt-1.5 h-1.5"
              />
            </li>
          ))}
        </ul>
      )}
    </ScCard>
  )
}

function Garages({ garages }: { garages: StatsFunnelReport['garages'] }) {
  const figure = 'text-right font-numeric tabular-nums text-text-primary'
  return (
    <ScCard className="px-4 pb-1.5 pt-4">
      <CardHeading
        title="Garages by views"
        subtitle="Page views against paid bookings"
      />
      {garages.length === 0 ? (
        <p className="py-4 text-[13px] text-text-secondary">
          No garage pages opened in this period.
        </p>
      ) : (
        <table className="mt-3.5 w-full table-fixed border-collapse text-[13px]">
          <colgroup>
            <col />
            <col className="w-[56px]" />
            <col className="w-[68px]" />
            <col className="w-[60px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border text-[12px] text-text-muted">
              <th scope="col" className="pb-2 text-left font-medium">
                Garage
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                Views
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                Bookings
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                <abbr title="Bookings over views" className="no-underline">
                  Rate
                </abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {garages.map((garage) => (
              <tr
                key={garage.vendorId}
                className="border-b border-border last:border-b-0"
              >
                <th scope="row" className="py-2.5 pr-2 text-left font-normal">
                  <span className="block truncate leading-[18px] text-text-primary">
                    {garage.name ?? 'A garage since deleted'}
                  </span>
                </th>
                <td className={figure}>
                  {garage.views.toLocaleString('en-IN')}
                </td>
                <td className={figure}>
                  {garage.bookings.toLocaleString('en-IN')}
                </td>
                <td className={figure}>{percent(garage.viewToBooking)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ScCard>
  )
}

function Devices({ devices }: { devices: StatsFunnelReport['devices'] }) {
  return (
    <ScCard className="px-4 py-4">
      <CardHeading title="Devices" subtitle="Visits by screen size" />
      <ul className="mt-4 flex flex-col gap-3.5">
        {devices.map((row) => (
          <li key={row.device}>
            <div className="flex items-baseline justify-between gap-2.5 text-[13px]">
              <span className="text-text-primary">
                {DEVICE_LABELS[row.device]}{' '}
                <em className="ml-1 not-italic text-[12px] text-text-muted">
                  {plural(row.visits, 'visit', 'visits')}
                </em>
              </span>
              <b className="font-numeric font-medium tabular-nums text-text-primary">
                {percent(row.share)}
              </b>
            </div>
            <ShareBar share={row.share ?? 0} className="mt-1.5 h-1.5" />
          </li>
        ))}
      </ul>
    </ScCard>
  )
}

function Returning({
  returning,
  weeks,
}: {
  returning: StatsFunnelReport['returning']
  weeks: StatsFunnelReport['weeks']
}) {
  const totals = weeks.reduce(
    (sum, week) => ({
      new: sum.new + week.new,
      repeat: sum.repeat + week.repeat,
    }),
    { new: 0, repeat: 0 }
  )
  return (
    <ScCard className="px-4 py-4">
      <CardHeading
        title="Returning customers"
        subtitle={`From bookings · ${plural(returning.customers, 'customer', 'customers')} paid in this period`}
      />
      <div className="mt-3.5 grid grid-cols-2 gap-2">
        {returning.windows.map((window) => (
          <div
            key={window.days}
            className="min-w-0 rounded-[14px] border border-border bg-surface px-3.5 py-3"
          >
            <p className="text-[12px] font-medium text-text-secondary">
              Booked again within {window.days} days
            </p>
            <p className="mt-1 font-numeric text-[24px] font-medium leading-[30px] tracking-tight text-text-primary">
              {percent(window.rate)}
            </p>
            <p className="mt-0.5 text-[12px] leading-[15px] text-text-muted">
              {returnWindowLine(window)}
            </p>
          </div>
        ))}
      </div>

      <figure className="mt-5">
        <figcaption>
          <p className="text-[13px] font-medium text-text-primary">
            New and repeat bookings per week
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-muted">
            <span className="flex items-center gap-1.5">
              <i
                aria-hidden="true"
                className="block size-2.5 rounded-[2px] bg-[#E4E4E7]"
              />
              Returning customer · {totals.repeat.toLocaleString('en-IN')}
            </span>
            <span className="flex items-center gap-1.5">
              <i
                aria-hidden="true"
                className="block size-2.5 rounded-[2px] bg-[#5C5C68]"
              />
              First booking · {totals.new.toLocaleString('en-IN')}
            </span>
          </p>
        </figcaption>
        {totals.new + totals.repeat === 0 ? (
          <p className="pt-4 text-[13px] text-text-secondary">
            No paid bookings in this period.
          </p>
        ) : (
          <div aria-hidden="true">
            <NewRepeatChart weeks={weeks} />
          </div>
        )}
        <p className="sr-only">
          {weeks
            .map(
              (week) =>
                `${rangeLabel({ from: week.start, to: week.end })}: ${week.repeat} by returning customers, ${week.new} first bookings`
            )
            .join('. ')}
        </p>
      </figure>
    </ScCard>
  )
}

/**
 * The Funnel tab: where visits drop off on the way to a paid booking, from
 * Detlio's own usage events, with the categories browsed, garages by views
 * against bookings and devices; and, from the bookings themselves, how many
 * customers come back.
 */
export function FunnelTab({
  range,
  mode,
}: {
  range: DateRange
  mode: StatsFunnelMode
}) {
  const router = useRouter()
  const stats = useStatsFunnel({ ...range, mode })

  useEffect(() => {
    if (isAuthError(stats.error)) router.replace('/login')
  }, [stats.error, router])

  if (!stats.data) {
    return stats.isError ? (
      <ErrorState
        message={errorMessage(stats.error, "Couldn't load the funnel.")}
        onRetry={() => void stats.refetch()}
      />
    ) : (
      <div role="status" aria-busy="true" className="flex flex-col gap-5">
        <span className="sr-only">Loading</span>
        <Skeleton className="h-[360px]" />
        <Skeleton className="h-[260px]" />
        <Skeleton className="h-[300px]" />
      </div>
    )
  }

  const report = stats.data
  const startNote = eventsStartNote(report.eventsSince, report.range)
  return (
    <>
      <div
        aria-busy={stats.isFetching || undefined}
        className={cn(
          'flex flex-col gap-5 transition-opacity',
          stats.isPlaceholderData && 'opacity-60'
        )}
      >
        {startNote && <Note>{startNote}</Note>}
        <Funnel funnel={report.funnel} />
        <Returning returning={report.returning} weeks={report.weeks} />
        <Garages garages={report.garages} />
        <Categories categories={report.categories} />
        <Devices devices={report.devices} />
      </div>
      <HowWeCount lines={HOW_WE_COUNT} />
    </>
  )
}
