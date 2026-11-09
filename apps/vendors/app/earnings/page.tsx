'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconDownload, IconReceipt } from '@tabler/icons-react'
import { fill, useT } from '@repo/core/i18n'
import { msg } from '@repo/core/i18n/translate'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScBadge } from '@repo/ui/sc/badge'
import { StatusChip } from '@repo/ui/sc/status-chip'
import type { StatusTone } from '@repo/core/status-tone'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { ScInput } from '@repo/ui/sc/input'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { SectionHeader } from '@repo/ui/sc/section-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { StatTile } from '@repo/ui/sc/stat-tile'
import { TopBar } from '@repo/ui/sc/top-bar'
import type { PayoutLine } from '@repo/core/api/admin'
import type { GarageStatementLine } from '@repo/core/api/earnings'
import {
  getEarningsStatement,
  type EarningsStatement,
} from '@repo/core/api/earnings'
import { downloadCsv, toCsv } from '@repo/core/csv'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import {
  LINE_STATUS_LABEL,
  PAYOUT_METHOD_LABEL,
  commissionLabel,
  earningsRange,
  istDateLabel,
  lineKindLabel,
  rupeesLabel,
  statementCsvRows,
  type EarningsRangePreset,
} from '@repo/core/payouts'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { cn } from '@repo/core/utils'
import { ActiveGarage } from '@/components/active-garage'

type Preset = EarningsRangePreset | 'custom'

// English, shown as `t(label)`.
const PRESETS: Array<{ value: Preset; label: string }> = [
  { value: 'last30', label: msg('30 days') },
  { value: 'thisMonth', label: msg('This month') },
  { value: 'lastMonth', label: msg('Last month') },
  { value: 'custom', label: msg('Dates') },
]

/** One figure of a booking's breakdown, left out when it is nothing; the label comes translated. */
function Figure({
  label,
  value,
  minus,
  strong,
}: {
  label: string
  value: string
  minus?: boolean
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12px]">
      <dt
        className={
          strong ? 'font-medium text-text-primary' : 'text-text-secondary'
        }
      >
        {label}
      </dt>
      <dd
        className={cn(
          'font-numeric',
          strong ? 'font-semibold text-text-primary' : 'text-text-primary'
        )}
      >
        {minus ? `−${value}` : value}
      </dd>
    </div>
  )
}

/**
 * A payout line's state, one colour per meaning (UX audit, garage finding
 * 7): green once paid, blue while due to the garage (money owed to it is
 * never amber), amber only for money the garage owes back.
 */
const LINE_TONE: Partial<Record<PayoutLine['status'], StatusTone>> = {
  paid: 'done',
  due: 'progress',
  owed_back: 'attention',
}

function StatusBadge({ line }: { line: PayoutLine }) {
  const t = useT()
  return (
    <StatusChip tone={LINE_TONE[line.status] ?? 'closed'}>
      {t(LINE_STATUS_LABEL[line.status])}
    </StatusChip>
  )
}

function LineCard({ line }: { line: GarageStatementLine }) {
  const t = useT()
  const kind = lineKindLabel(line.kind)
  return (
    <ScCard
      role="group"
      aria-label={t('Booking #{reference}', { reference: line.reference })}
      className="flex flex-col gap-2.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-text-primary">
            {line.services.join(' + ') || t('Booking')}
          </p>
          <p className="text-[11px] text-text-secondary">
            {line.customerFirstName} ·{' '}
            <span className="font-numeric">
              {istDateLabel(line.payableFrom)}
            </span>{' '}
            · <span className="font-numeric">#{line.reference}</span>
          </p>
          {kind && (
            <ScBadge variant="muted" className="mt-1">
              {kind}
            </ScBadge>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className="font-numeric text-[14px] font-bold text-text-primary">
            {rupeesLabel(line.share)}
          </p>
          <StatusBadge line={line} />
        </div>
      </div>

      <dl className="flex flex-col gap-1 border-t border-border pt-2">
        <Figure label={t('Price')} value={rupeesLabel(line.price)} />
        {(line.travelFee ?? 0) > 0 && (
          // An accepted request's travel fee (0062): part of the price, the
          // garage's whole, with no commission on it.
          <Figure
            label={t('Travel fee (yours, no commission)')}
            value={rupeesLabel(line.travelFee ?? 0)}
          />
        )}
        {line.detlioPromo > 0 && (
          // Detlio pays for its own promos: shown so the garage sees why the
          // customer paid less, and that it changes nothing for the garage.
          <Figure
            label={t('Detlio promo (paid by Detlio)')}
            value={rupeesLabel(line.detlioPromo)}
          />
        )}
        {line.garagePromo > 0 && (
          <Figure
            label={t('Your promo')}
            value={rupeesLabel(line.garagePromo)}
            minus
          />
        )}
        {line.refunds > 0 && (
          <Figure label={t('Refunded')} value={rupeesLabel(line.refunds)} minus />
        )}
        <div className="flex items-baseline justify-between gap-3 text-[12px]">
          <dt className="text-text-secondary">{t('Detlio commission')}</dt>
          <dd
            className={cn(
              'text-right',
              line.commission.freePosition !== null
                ? 'text-success'
                : 'font-numeric text-text-primary'
            )}
          >
            {line.commission.freePosition !== null
              ? commissionLabel(line)
              : `−${commissionLabel(line)}`}
          </dd>
        </div>
        <Figure label={t('Your share')} value={rupeesLabel(line.share)} strong />
        {line.heldByGarage > 0 && (
          <Figure
            label={t('Cash you collected')}
            value={rupeesLabel(line.heldByGarage)}
            minus
          />
        )}
      </dl>

      {line.payouts.length > 0 && (
        <p className="text-[11px] text-text-secondary">
          {line.payouts.map((payout, i) => (
            <span key={payout.payoutId}>
              {i > 0 && ' · '}
              {fill(
                payout.amount < 0
                  ? t('Taken back {amount} on {date}, ref {reference}')
                  : t('Paid {amount} on {date}, ref {reference}'),
                {
                  amount: rupeesLabel(Math.abs(payout.amount)),
                  date: (
                    <span className="font-numeric">
                      {istDateLabel(payout.paidAt)}
                    </span>
                  ),
                  reference: (
                    <span className="font-numeric text-text-primary">
                      {payout.reference}
                    </span>
                  ),
                }
              )}
            </span>
          ))}
        </p>
      )}
      {line.status === 'due' && line.paid !== 0 && (
        <p className="text-[11px] text-text-secondary">
          {fill(t('{amount} more to come'), {
            amount: (
              <span className="font-numeric text-text-primary">
                {rupeesLabel(line.balance)}
              </span>
            ),
          })}
        </p>
      )}
      {line.status === 'owed_back' && (
        <p className="text-[11px] text-text-secondary">
          {fill(t('{amount} comes off your next payout'), {
            amount: (
              <span className="font-numeric text-text-primary">
                {rupeesLabel(-line.balance)}
              </span>
            ),
          })}
        </p>
      )}
    </ScCard>
  )
}

export default function VendorEarningsPage() {
  const t = useT()
  const vendor = useAuthStore((s) => s.vendor)
  const isVendorAdmin = useIsVendorAdmin()
  const router = useRouter()
  const [preset, setPreset] = useState<Preset>('last30')
  const [range, setRange] = useState(() => earningsRange('last30', new Date()))
  const [statement, setStatement] = useState<EarningsStatement | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  // Operators have no Earnings tab, so this is only reachable by typing the
  // URL. Send them home rather than show money that is not theirs to see
  // (the API refuses them anyway).
  useEffect(() => {
    if (!isVendorAdmin) router.replace('/home')
  }, [isVendorAdmin, router])

  useEffect(() => {
    if (!vendor?.id || !isVendorAdmin) return
    let active = true
    getEarningsStatement(range)
      .then((next) => {
        if (!active) return
        setStatement(next)
        setError(false)
      })
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [range, vendor?.id, isVendorAdmin, attempt])

  if (!isVendorAdmin) return null

  const pick = (next: Preset) => {
    setPreset(next)
    if (next !== 'custom') {
      setLoading(true)
      setRange(earningsRange(next, new Date()))
    }
  }

  const setDate = (key: 'from' | 'to', value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return
    const next = { ...range, [key]: value }
    if (next.from > next.to) return
    setLoading(true)
    setRange(next)
  }

  const download = () => {
    if (!statement) return
    const { header, rows } = statementCsvRows(statement.lines)
    downloadCsv(
      toCsv(header, rows),
      `detlio-earnings-${statement.range.from}-to-${statement.range.to}.csv`
    )
  }

  const summary = statement?.summary
  const owesDetlio = (summary?.balanceDue ?? 0) < 0

  return (
    <AppShell
      showNav
      navType="vendor"
      showBrand
      brandRight={<ActiveGarage />}
      className="gap-5 py-4"
    >
      <TopBar title={t('Earnings')} />

      {!statement && loading ? (
        <SkeletonList
          count={2}
          itemClassName="h-[76px]"
          className="grid grid-cols-2"
        />
      ) : !statement && error ? (
        <ErrorState
          message={t("Couldn't load your earnings.")}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      ) : summary ? (
        <section aria-label={t('Your balance')} className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              label={owesDetlio ? t('You owe Detlio') : t('Due now')}
              // Money owed to the garage is never amber (finding 7): amber
              // is for a problem, and this is good news.
              value={rupeesLabel(Math.abs(summary.balanceDue))}
              hint={
                owesDetlio
                  ? t('Comes off your next payout')
                  : summary.oldestUnpaidAt
                    ? t('Oldest from {date}', { date: istDateLabel(summary.oldestUnpaidAt) })
                    : t('Paid within {hours} hours', { hours: statement.cycleHours })
              }
            />
            <StatTile
              label={t('Paid this month')}
              tone="success"
              value={rupeesLabel(summary.paidThisMonth)}
            />
          </div>
          <p className="text-[11px] text-text-secondary">
            {t(
              'Detlio pays your share within {hours} hours of each job, by bank transfer or UPI. Commission is 8% on washes, packages and others, 5% on detailing, coating and scratch removal.',
              { hours: statement.cycleHours }
            )}
            {summary.freeBookings.used < summary.freeBookings.of
              ? ` ${t('Your first {count} bookings are free: {used} used so far.', {
                  count: summary.freeBookings.of,
                  used: summary.freeBookings.used,
                })}`
              : ''}
          </p>
        </section>
      ) : null}

      <section className="flex flex-col gap-3" aria-label={t('Bookings')}>
        <SectionHeader
          title={t('Bookings')}
          action={
            <ScButton
              variant="outline"
              size="md"
              onClick={download}
              disabled={!statement || statement.lines.length === 0}
              className="flex min-h-12 items-center gap-1.5 px-4 text-[14px]"
            >
              <IconDownload size={15} aria-hidden="true" /> CSV
            </ScButton>
          }
        />
        <ScSegmented
          aria-label={t('Period')}
          value={preset}
          onChange={pick}
          options={PRESETS.map((option) => ({ ...option, label: t(option.label) }))}
          className="[&_[role=radio]]:min-h-12 [&_[role=radio]]:text-[15px]"
        />
        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <ScInput
              type="date"
              label={t('From')}
              value={range.from}
              max={range.to}
              onChange={(e) => setDate('from', e.target.value)}
              className="min-h-11 font-numeric"
            />
            <ScInput
              type="date"
              label={t('To')}
              value={range.to}
              min={range.from}
              onChange={(e) => setDate('to', e.target.value)}
              className="min-h-11 font-numeric"
            />
          </div>
        )}

        {statement && error && (
          <p role="status" className="text-[12px] text-error">
            {t("Couldn't load those dates. Showing {from} to {to}.", {
              from: istDateLabel(`${statement.range.from}T12:00:00+05:30`),
              to: istDateLabel(`${statement.range.to}T12:00:00+05:30`),
            })}
          </p>
        )}
        {!statement && loading ? (
          <SkeletonList count={3} itemClassName="h-[140px]" />
        ) : statement && statement.lines.length === 0 ? (
          <EmptyState
            icon={<IconReceipt size={28} stroke={1.5} />}
            title={t('Nothing in these dates')}
            subtitle={t(
              "Each job you complete shows up here with Detlio's commission, your share and its payout."
            )}
          />
        ) : statement ? (
          <div
            aria-busy={loading || undefined}
            className={cn(
              'flex flex-col gap-2 transition-opacity duration-200 motion-reduce:transition-none',
              loading && 'opacity-60'
            )}
          >
            {statement.lines.map((line) => (
              <LineCard key={line.bookingId} line={line} />
            ))}
          </div>
        ) : null}
      </section>

      {statement && statement.payouts.length > 0 && (
        <section className="flex flex-col gap-3" aria-label={t('Payouts')}>
          <SectionHeader title={t('Payouts')} />
          <div className="flex flex-col gap-2">
            {statement.payouts.map((payout) => (
              <ScCard
                key={payout.id}
                className="flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-text-primary">
                    {t(PAYOUT_METHOD_LABEL[payout.method])} ·{' '}
                    <span className="font-numeric">
                      {istDateLabel(payout.paidAt)}
                    </span>
                  </p>
                  <p className="truncate text-[11px] text-text-secondary">
                    {fill(t('Ref {reference}'), {
                      reference: (
                        <span className="font-numeric text-text-primary">
                          {payout.reference}
                        </span>
                      ),
                    })}
                  </p>
                </div>
                <p className="font-numeric text-[14px] font-bold text-success">
                  {rupeesLabel(payout.amount)}
                </p>
              </ScCard>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  )
}
