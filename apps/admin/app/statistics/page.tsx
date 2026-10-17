'use client'

import { Suspense, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PageHeader } from '@repo/ui/sc/page-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { BreakdownTab } from '@/components/statistics/breakdown-tab'
import { CommissionTab } from '@/components/statistics/commission-tab'
import { CompareToggle, GarageSelect, ModeSelect, PeriodSelect } from '@/components/statistics/filters'
import { FunnelTab } from '@/components/statistics/funnel-tab'
import { OverviewTab } from '@/components/statistics/overview-tab'
import { isStatsTab, StatsTabs, type StatsTab } from '@/components/statistics/stats-tabs'
import { todayIst } from '@/lib/bookings'
import {
  comparedWith,
  comparisonDates,
  DEFAULT_PERIOD,
  FUNNEL_MODES,
  FUNNEL_PERIODS,
  funnelPeriod,
  isFunnelMode,
  isPeriod,
  monthOptions,
  monthRange,
  PERIODS,
  periodRange,
} from '@/lib/statistics'

/**
 * Statistics: bookings, money and garages over a period, in four tabs —
 * Overview (six figures and two charts, with the pilot's own numbers),
 * Breakdown (funnel, garages, service types, busy hours, CSV), Commission
 * (Detlio's commission and each garage's free 25, reporting only) and Funnel
 * (where visits drop off on the way to a booking, from Detlio's own usage
 * events, and returning customers).
 *
 * Every filter lives in the URL (tab, period, garage, compare, month, mode),
 * so a view can be shared and Back returns to it. One filter row above
 * everything it scopes; the comparison switch only on Overview, the one tab
 * that draws the period before. Commission goes by calendar month; the
 * Funnel by the last 7, 30 or 90 days and a booking type, not a garage.
 */
function Statistics() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const tabParam = params.get('tab')
  const tab: StatsTab = isStatsTab(tabParam) ? tabParam : 'overview'
  const periodParam = params.get('period')
  const period = isPeriod(periodParam) ? periodParam : DEFAULT_PERIOD
  const vendorId = params.get('garage') ?? ''
  // On unless switched off: the owner reads a figure against the one before.
  const compare = params.get('compare') !== '0'

  const today = todayIst()
  const months = monthOptions(today)
  const monthParam = params.get('month')
  const month = months.some((m) => m.value === monthParam) ? (monthParam as string) : months[0].value

  const hrefWith = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(params.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      const query = next.toString()
      return query ? `${pathname}?${query}` : pathname
    },
    [params, pathname]
  )
  const setParams = (updates: Record<string, string>) =>
    router.replace(hrefWith(updates), { scroll: false })

  const range = periodRange(period, today)
  const periodName = PERIODS.find((p) => p.value === period)?.label ?? ''
  const previous = comparedWith(range)
  const monthName = months.find((m) => m.value === month)?.label.split(' ')[0] ?? ''
  const modeParam = params.get('mode')
  const mode = isFunnelMode(modeParam) ? modeParam : 'all'
  const funnelRange = periodRange(funnelPeriod(period), today)

  return (
    <>
      <PageHeader
        title="Statistics"
        subtitle="Bookings, money and garages"
        // On a phone the bottom bar has no room for Alerts; the header has it
        // on a wider screen.
        actions={
          <Link href="/alerts" className="tap-target text-[12px] text-text-secondary hover:text-text-primary md:hidden">
            Telegram alerts
          </Link>
        }
      />
      <StatsTabs
        current={tab}
        hrefFor={(next) => hrefWith({ tab: next === 'overview' ? '' : next })}
      />

      <div className="-mt-1 flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          {tab === 'commission' ? (
            <PeriodSelect
              value={month}
              options={months}
              onChange={(next) => setParams({ month: next === months[0].value ? '' : next })}
            />
          ) : tab === 'funnel' ? (
            <PeriodSelect
              value={funnelPeriod(period)}
              options={FUNNEL_PERIODS}
              onChange={(next) => setParams({ period: next === DEFAULT_PERIOD ? '' : next })}
            />
          ) : (
            <PeriodSelect
              value={period}
              options={PERIODS}
              onChange={(next) => setParams({ period: next === DEFAULT_PERIOD ? '' : next })}
            />
          )}
          {tab === 'funnel' ? (
            <ModeSelect
              value={mode}
              options={FUNNEL_MODES}
              onChange={(next) => setParams({ mode: next === 'all' ? '' : next })}
            />
          ) : (
            <GarageSelect value={vendorId} onChange={(next) => setParams({ garage: next })} />
          )}
        </div>
        {tab === 'overview' && (
          <CompareToggle
            checked={compare}
            onChange={(on) => setParams({ compare: on ? '' : '0' })}
            title={`Compare with ${previous}`}
            dates={comparisonDates(range)}
          />
        )}
      </div>

      {tab === 'overview' && (
        <OverviewTab
          range={range}
          vendorId={vendorId}
          compare={compare}
          endsToday={range.to === today}
          periodName={periodName}
          previousName={previous.charAt(0).toUpperCase() + previous.slice(1)}
        />
      )}
      {tab === 'breakdown' && <BreakdownTab range={range} vendorId={vendorId} />}
      {tab === 'funnel' && <FunnelTab range={funnelRange} mode={mode} />}
      {tab === 'commission' && (
        <CommissionTab
          range={monthRange(month, today)}
          vendorId={vendorId}
          title={
            month === months[0].value
              ? `Commission in ${monthName} so far`
              : `Commission in ${monthName}`
          }
        />
      )}
    </>
  )
}

export default function AdminStatisticsPage() {
  // useSearchParams needs a Suspense boundary for the static build.
  return (
    <Suspense fallback={<SkeletonList count={3} itemClassName="h-28" />}>
      <Statistics />
    </Suspense>
  )
}
