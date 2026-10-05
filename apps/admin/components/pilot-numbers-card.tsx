'use client'

import { useState } from 'react'
import { ScCard } from '@repo/ui/sc/card'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { usePilotStats } from '@repo/core/api/hooks/use-pilot-stats'
import type { PilotStats } from '@repo/core/api/admin'
import { cn } from '@repo/core/utils'

const WINDOWS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
] as const

function rupees(value: number): string {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

/** "62%", or a dash when there was nothing to divide by. */
function percent(rate: number | null): string {
  return rate === null ? '–' : `${Math.round(rate * 100)}%`
}

/** What the accept-time median was taken over, or why there is none. */
function acceptHint(samples: number): string {
  if (samples >= 3) return `Median over ${samples} accepted bookings`
  return samples === 0
    ? 'No bookings accepted in this window yet'
    : `Only ${samples} accepted in this window; the median needs 3`
}

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string | number
  hint?: string
  /** Amber when the number is a problem someone should act on. */
  tone?: 'warn'
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p
        className={cn(
          'font-numeric text-[22px] font-bold leading-7',
          tone === 'warn' ? 'text-error' : 'text-text-primary'
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-text-secondary">{hint}</p>}
    </div>
  )
}

function Body({ stats }: { stats: PilotStats }) {
  return (
    <div className="flex flex-col gap-5">
      {/* The funnel, left to right, each step with its conversion from the one
          before — the three rates the pilot is judged on. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure label="Checkouts started" value={stats.checkoutsStarted} />
        <Figure
          label="Paid"
          value={stats.paid}
          hint={`${percent(stats.rates.paidOfStarted)} of started`}
        />
        <Figure
          label="Accepted by garage"
          value={stats.accepted}
          hint={`${percent(stats.rates.acceptedOfPaid)} of paid`}
        />
        <Figure
          label="Completed"
          value={stats.completed}
          hint={`${percent(stats.rates.completedOfAccepted)} of accepted`}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure
          label="Revenue"
          value={rupees(stats.revenue)}
          hint="After refunds owed, with final bills paid in the app"
        />
        {/* Counts every one in the window, refunded or not, so it says
            nothing about what is left to do: that is "Refunds owed" below,
            which carries the amber instead. */}
        <Figure
          label="Paid, no booking"
          value={stats.paidNoBooking}
          hint="Payments that became no booking; what's still to refund is below"
        />
        <Figure
          label="No-shows"
          value={stats.customerNoShows + stats.garageNoShows}
          hint={`Customer ${stats.customerNoShows} · Garage ${stats.garageNoShows}`}
        />
        <Figure
          label="Cancelled"
          value={stats.cancelledByCustomer + stats.cancelledByGarage + stats.cancelledByDetlio}
          hint={`Customer ${stats.cancelledByCustomer} · Garage ${stats.cancelledByGarage} · Detlio ${stats.cancelledByDetlio}`}
        />
      </div>

      {/* Refunds: the to-do list (whenever each became owed, not just this
          window) and what was given back in the window. Absent from an
          older server. */}
      {stats.refundsOwed !== undefined && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Figure
            label="Refunds owed"
            value={stats.refundsOwed}
            hint={`${rupees(stats.refundsOwedAmount ?? 0)} to give back, any date`}
            tone={stats.refundsOwed > 0 ? 'warn' : undefined}
          />
          <Figure
            label="Refunded"
            value={stats.refunded ?? 0}
            hint={`${rupees(stats.refundedAmount ?? 0)} in this window`}
          />
        </div>
      )}

      <div>
        <p className="pb-2 text-[10px] font-medium uppercase tracking-wide text-text-muted">
          Top garages by paid bookings
        </p>
        {stats.topGarages.length === 0 ? (
          <p className="text-[12px] text-text-secondary">No paid bookings in this window yet.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border">
            {stats.topGarages.map((garage, i) => (
              <li key={garage.vendorId} className="flex items-center gap-3 py-2 text-[13px]">
                <span className="font-numeric w-4 text-text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-text-primary">{garage.name}</span>
                <span className="font-numeric text-text-primary">{garage.paidBookings}</span>
                <span className="font-numeric w-20 text-right text-text-secondary">
                  {rupees(garage.revenue)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure
          label="Payment to accept"
          value={
            stats.medianAcceptMins == null ? 'Not enough data' : `${stats.medianAcceptMins} min`
          }
          hint={acceptHint(stats.acceptSamples ?? 0)}
        />
      </div>

      {/* Said rather than left out silently: someone will look for older ones. */}
      <p className="text-[11px] text-text-muted">
        Accept times are recorded from this release on, so bookings accepted
        before it aren&apos;t in the median.
      </p>
    </div>
  )
}

/**
 * How the pilot is going, over the last 7 or 30 days: the checkout funnel,
 * how bookings ended, the money, and the busiest garages. Counts are worked
 * out on the server (GET /admin/stats/pilot); the definitions are in
 * apps/server/src/lib/pilot-stats.ts.
 */
export function PilotNumbersCard() {
  const [days, setDays] = useState<'7' | '30'>('7')
  const stats = usePilotStats(days === '7' ? 7 : 30)

  return (
    <ScCard className="flex flex-col gap-4 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-text-primary">Pilot numbers</h2>
        {/* Full size, not `sm`: it is the card's only control and is used on
            a phone, so each option gets a 44px touch target. */}
        <ScSegmented
          aria-label="Window"
          className="w-full sm:w-56 [&_[role=radio]]:min-h-11"
          value={days}
          onChange={setDays}
          options={WINDOWS.map((w) => ({ value: w.value, label: w.label }))}
        />
      </div>

      {stats.data ? (
        <div
          aria-busy={stats.isFetching || undefined}
          className={cn('transition-opacity', stats.isPlaceholderData && 'opacity-60')}
        >
          <Body stats={stats.data} />
        </div>
      ) : stats.isError ? (
        <ErrorState message="Couldn't load the pilot numbers." onRetry={() => void stats.refetch()} />
      ) : (
        <p className="py-6 text-center text-[13px] text-text-secondary">Counting…</p>
      )}
    </ScCard>
  )
}
