'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { StatTile } from '@repo/ui/sc/stat-tile'
import {
  getAdminRewardsLedger,
  type AdminRewardsSummary,
} from '@repo/core/api/rewards'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useAdminRewardsSummary } from '@repo/core/api/hooks/use-admin-rewards'
import { downloadCsv } from '@repo/core/csv'
import { formatRupees } from '@/lib/bookings'
import { ledgerCsv, monthLabel, percentOf, recentMonths } from '@/lib/rewards'

function Section({
  title,
  children,
  note,
}: {
  title: string
  children: React.ReactNode
  note?: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      {children}
      {note && <p className="text-[11px] text-text-muted">{note}</p>}
    </section>
  )
}

function Table({
  head,
  rows,
}: {
  head: string[]
  rows: Array<Array<React.ReactNode>>
}) {
  return (
    <ScCard className="overflow-x-auto px-0 py-1">
      <table className="w-full min-w-[480px] text-left text-[12px]">
        <thead>
          <tr className="text-text-secondary">
            {head.map((h, i) => (
              <th
                key={h}
                className={
                  i === 0
                    ? 'px-3.5 py-2 font-medium'
                    : 'px-3 py-2 text-right font-medium'
                }
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, i) => (
                <td
                  key={i}
                  className={
                    i === 0
                      ? 'px-3.5 py-2 text-text-primary'
                      : 'px-3 py-2 text-right font-numeric text-text-primary'
                  }
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ScCard>
  )
}

/**
 * Admin → Rewards → Overview: one IST month against the budget, what was
 * issued, used and lapsed by type, scratch prizes drawn and given, stamps
 * by source, the level ladder's population and moves, streaks, the invite
 * funnel, top customers and the abuse flags; and the month's every event as
 * a CSV. Aggregates only; phones masked.
 */
export function RewardsOverview({
  onOpenCustomer,
}: {
  onOpenCustomer: (userId: string) => void
}) {
  const months = recentMonths()
  const [month, setMonth] = useState(months[0])
  const summary = useAdminRewardsSummary(month, true)
  const [exporting, setExporting] = useState(false)

  const exportCsv = async () => {
    setExporting(true)
    try {
      const ledger = await getAdminRewardsLedger(month)
      downloadCsv(ledgerCsv(ledger), `detlio-rewards-${month}.csv`)
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't make the CSV"))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="rewards-month" className="sr-only">
          Month
        </label>
        <select
          id="rewards-month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-10 rounded-[10px] border border-border bg-surface px-3 text-[13px] text-text-primary"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <ScButton
          variant="secondary"
          fullWidth={false}
          className="h-10 px-4 text-[13px]"
          onClick={() => void exportCsv()}
          disabled={exporting}
        >
          {exporting ? 'Making CSV…' : 'Download CSV'}
        </ScButton>
      </div>
      {summary.isPending ? (
        <SkeletonList />
      ) : summary.isError || !summary.data ? (
        <ErrorState
          message={errorMessage(summary.error, "Couldn't load the month")}
          onRetry={() => void summary.refetch()}
        />
      ) : (
        <OverviewBody data={summary.data} onOpenCustomer={onOpenCustomer} />
      )}
    </div>
  )
}

function OverviewBody({
  data,
  onOpenCustomer,
}: {
  data: AdminRewardsSummary
  onOpenCustomer: (userId: string) => void
}) {
  const issued = Number(data.issued)
  const cap = Number(data.cap)
  const share = cap > 0 ? Math.min(100, Math.round((issued / cap) * 100)) : 100
  const f = data.referrals.month
  const all = data.referrals.allTime

  return (
    <>
      <ScCard className="flex flex-col gap-2 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] font-medium text-text-secondary">
            Rewards issued vs monthly budget
          </p>
          {!data.live && <ScBadge variant="pending">Not live</ScBadge>}
        </div>
        <p className="font-numeric text-[32px] font-bold leading-none tracking-tight text-text-primary">
          {formatRupees(data.issued)}{' '}
          <span className="text-[16px] font-medium text-text-secondary">
            of {formatRupees(data.cap)}
          </span>
        </p>
        <div
          className="h-[6px] w-full overflow-hidden rounded-full bg-surface-elevated"
          aria-hidden
        >
          <div
            className={
              share >= 100 ? 'h-full bg-warning' : 'h-full bg-brand-white'
            }
            style={{ width: `${share}%` }}
          />
        </div>
        <p className="text-[12px] text-text-secondary">
          Shine, invite, perk and team vouchers when issued, plus scratch-card
          money prizes when the card is made (
          {formatRupees(data.scratchPrizesCounted)} this month).
          {data.capReachedAt
            ? ' Budget reached: new scratch cards give a bonus stamp instead of money; everything else is still honoured.'
            : ''}
        </p>
      </ScCard>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Stamps earned"
          value={data.stamps.bySource.reduce((s, r) => s + r.earned, 0)}
          hint={`${data.bookings.earned} bookings judged a stamp`}
        />
        <StatTile
          label="No stamp"
          value={data.bookings.refused}
          hint={`${data.bookings.revoked} taken back later`}
        />
        <StatTile
          label="Customers in the programme"
          value={data.levels.customers}
          hint={`${data.levels.movedUp} up · ${data.levels.movedDown} down this month`}
        />
        <StatTile
          label="Prizes past budget"
          value={data.scratch.fellBack}
          hint="Given as a bonus stamp"
          tone={data.scratch.fellBack > 0 ? 'warning' : 'default'}
        />
      </div>

      <Section
        title="Vouchers by type"
        note="Redeemed = used on a booking made this month that still holds it (a cancelled booking gives it back). Expired = lapsed this month unused."
      >
        <Table
          head={[
            'Type',
            'Issued',
            '₹ issued',
            'Redeemed',
            '₹ off',
            'Expired',
            '₹ lapsed',
          ]}
          rows={data.vouchers.issued.map((row, i) => [
            row.label,
            row.count,
            formatRupees(row.amount),
            data.vouchers.redeemed[i].count,
            formatRupees(data.vouchers.redeemed[i].amount),
            data.vouchers.expired[i].count,
            formatRupees(data.vouchers.expired[i].amount),
          ])}
        />
      </Section>

      <Section
        title="Stamps by source"
        note={`${data.stamps.lapsedThisMonth} stamps lapsed this month unused (any month's).`}
      >
        <Table
          head={['Source', 'Earned', 'In a reward', 'Lapsed', 'Removed']}
          rows={data.stamps.bySource.map((row) => [
            row.label,
            row.earned,
            row.used,
            row.lapsed,
            row.removed,
          ])}
        />
      </Section>

      <Section
        title="Scratch cards"
        note={`${data.scratch.expiredUnscratched} cards lapsed unscratched this month. Drawn is the server's draw; given is after the budget.`}
      >
        <Table
          head={['Prize', 'Odds', 'Drawn', 'Given', 'Scratched']}
          rows={data.scratch.outcomes.map((row) => [
            row.label,
            `${row.weight}%`,
            row.drawn,
            row.given,
            row.scratched,
          ])}
        />
      </Section>

      <Section
        title="Levels"
        note={`${data.levels.noShowDrops} customer no-shows this month (one level off each). Moves compare each customer's level now with the 1st of the month.`}
      >
        <Table
          head={['Level', 'Customers', 'Share']}
          rows={data.levels.distribution.map((row) => [
            row.label,
            row.customers,
            percentOf(row.customers, data.levels.customers),
          ])}
        />
      </Section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Active streaks"
          value={data.streaks.active}
          hint="A stamp this month or last"
        />
        <StatTile label="1-month" value={data.streaks.oneMonth} />
        <StatTile label="2 months or more" value={data.streaks.twoPlus} />
        <StatTile
          label="Streak bonuses"
          value={data.streaks.bonusesThisMonth}
          hint="Stamps this month"
        />
      </div>

      <Section title="Invite a friend">
        <Table
          head={[
            '',
            'Opened',
            'Signed up',
            'First booking',
            'Rewarded',
            'Refused',
          ]}
          rows={[
            [
              'This month',
              f.opened,
              f.signedUp,
              f.firstBooking,
              f.rewarded,
              f.refused,
            ],
            [
              'All time',
              all.opened,
              all.signedUp,
              all.firstBooking,
              all.rewarded,
              all.refused,
            ],
          ]}
        />
      </Section>

      <Section title="Top customers (12 months)">
        <Table
          head={['Customer', 'Stamp bookings', 'Vouchers', 'Saved']}
          rows={data.topCustomers.map((row) => [
            <button
              key={row.userId}
              type="button"
              className="text-left underline underline-offset-4"
              onClick={() => onOpenCustomer(row.userId)}
            >
              {row.name}{' '}
              <span className="font-numeric text-text-muted">{row.phone}</span>
            </button>,
            row.earned,
            row.vouchers,
            formatRupees(row.saved),
          ])}
        />
      </Section>

      <Section
        title="Flagged: stamps mostly from bookings 80%+ off"
        note="More than half of their stamp-earning bookings in 12 months had promo codes or vouchers worth 80% or more. Look before adjusting."
      >
        {data.flagged.length === 0 ? (
          <ScCard>
            <p className="text-[12px] text-text-secondary">Nobody right now.</p>
          </ScCard>
        ) : (
          <Table
            head={['Customer', 'Stamp bookings', '80%+ off']}
            rows={data.flagged.map((row) => [
              <button
                key={row.userId}
                type="button"
                className="text-left underline underline-offset-4"
                onClick={() => onOpenCustomer(row.userId)}
              >
                {row.name}{' '}
                <span className="font-numeric text-text-muted">
                  {row.phone}
                </span>
              </button>,
              row.earned,
              row.heavy,
            ])}
          />
        )}
      </Section>
    </>
  )
}
