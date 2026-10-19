'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconCash, IconChevronRight, IconDownload } from '@tabler/icons-react'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { PageHeader } from '@repo/ui/sc/page-header'
import { Reveal } from '@repo/ui/sc/reveal'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { StatTile } from '@repo/ui/sc/stat-tile'
import type { AdminPayoutsList } from '@repo/core/api/admin'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { useAdminPayouts } from '@repo/core/api/hooks/use-admin-payouts'
import { downloadCsv, toCsv } from '@repo/core/csv'
import { useNow } from '@repo/core/hooks/use-now'
import { istDateLabel, rupeesLabel, waitedLabel } from '@repo/core/payouts'
import { cn } from '@repo/core/utils'
import { todayIst } from '@/lib/bookings'

type GarageRow = AdminPayoutsList['garages'][number]

function exportList(rows: GarageRow[]) {
  const csv = toCsv(
    [
      'Garage',
      'Balance due',
      'Bookings',
      'Oldest unpaid (IST)',
      'Past 24 hours',
      'Last payout',
      'Last payout date',
      'Pay to',
    ],
    rows.map((row) => [
      row.garage.name,
      row.balanceDue.toFixed(2),
      row.bookingsDue,
      row.oldestUnpaidAt ? istDateLabel(row.oldestUnpaidAt) : '',
      row.overdue ? 'Yes' : 'No',
      row.lastPayout ? row.lastPayout.amount.toFixed(2) : '',
      row.lastPayout ? istDateLabel(row.lastPayout.paidAt) : '',
      row.account
        ? `${row.account.method === 'bank' ? 'Bank' : 'UPI'} ${row.account.masked}`
        : '',
    ])
  )
  downloadCsv(csv, `detlio-payouts-${todayIst()}.csv`)
}

function GarageCard({ row, now }: { row: GarageRow; now: Date }) {
  const owesDetlio = row.balanceDue < 0
  return (
    <Link
      href={`/payouts/${row.garage.id}`}
      className="block rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary/70"
    >
      <ScCard className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-[14px] font-medium text-text-primary">
            <span className="truncate">{row.garage.name}</span>
            {row.garage.deleted ? (
              <ScBadge variant="muted">Deleted</ScBadge>
            ) : row.garage.inBin ? (
              <ScBadge variant="muted">In the Bin</ScBadge>
            ) : null}
          </p>
          <p className="text-[12px] text-text-secondary">
            {row.bookingsDue === 0
              ? 'Nothing to settle'
              : `${row.bookingsDue} ${row.bookingsDue === 1 ? 'booking' : 'bookings'}`}
            {row.oldestUnpaidAt && (
              <>
                {' '}
                · oldest{' '}
                <span className="font-numeric">
                  {istDateLabel(row.oldestUnpaidAt)}
                </span>{' '}
                (
                <span className="font-numeric">
                  {waitedLabel(row.oldestUnpaidAt, now)}
                </span>
                )
              </>
            )}
          </p>
          <p className="text-[11px] text-text-muted">
            {row.account ? (
              <>
                {row.account.method === 'bank' ? 'Bank' : 'UPI'}{' '}
                <span className="font-numeric">{row.account.masked}</span>
              </>
            ) : (
              'No payout details yet'
            )}
            {row.lastPayout && (
              <>
                {' '}
                · last paid{' '}
                <span className="font-numeric">
                  {rupeesLabel(row.lastPayout.amount)}
                </span>{' '}
                on{' '}
                <span className="font-numeric">
                  {istDateLabel(row.lastPayout.paidAt)}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex flex-col items-end gap-1">
            <p
              className={cn(
                'font-numeric text-[15px] font-bold',
                row.overdue ? 'text-warning' : 'text-text-primary'
              )}
            >
              {owesDetlio
                ? `−${rupeesLabel(-row.balanceDue)}`
                : rupeesLabel(row.balanceDue)}
            </p>
            {row.overdue ? (
              <ScBadge variant="danger">Past 24 hours</ScBadge>
            ) : owesDetlio ? (
              <ScBadge variant="muted">Owes Detlio</ScBadge>
            ) : null}
          </div>
          <IconChevronRight
            size={16}
            aria-hidden="true"
            className="text-text-muted"
          />
        </div>
      </ScCard>
    </Link>
  )
}

export default function AdminPayoutsPage() {
  const router = useRouter()
  const now = new Date(useNow(60_000))
  const { data, isPending, error, refetch } = useAdminPayouts()

  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  const totals = data?.totals

  return (
    <>
      <PageHeader
        title="Payouts"
        subtitle={`What Detlio owes each garage. Pay within ${data?.cycleHours ?? 24} hours of the job, by bank or UPI, then record it here.`}
        actions={
          <ScButton
            variant="secondary"
            fullWidth={false}
            onClick={() => data && exportList(data.garages)}
            disabled={!data || data.garages.length === 0}
            className="flex min-h-11 items-center gap-1.5 px-3 text-[12px]"
          >
            <IconDownload size={15} aria-hidden="true" /> CSV
          </ScButton>
        }
      />

      {totals && (
        <div className="grid grid-cols-3 gap-2">
          <StatTile
            label="Due now"
            tone={totals.totalDue > 0 ? 'warning' : 'default'}
            value={rupeesLabel(totals.totalDue)}
          />
          <StatTile label="Garages" value={totals.garagesDue} />
          <StatTile
            label="Oldest"
            tone={totals.overdueGarages > 0 ? 'warning' : 'default'}
            value={
              totals.oldestUnpaidAt
                ? waitedLabel(totals.oldestUnpaidAt, now)
                : '—'
            }
            hint={
              totals.overdueGarages > 0
                ? `${totals.overdueGarages} past 24 hours`
                : undefined
            }
          />
        </div>
      )}

      {isPending ? (
        <SkeletonList count={3} itemClassName="h-24" />
      ) : error && !data ? (
        <ErrorState
          message={errorMessage(error, "Couldn't load payouts")}
          onRetry={() => void refetch()}
        />
      ) : !data || data.garages.length === 0 ? (
        <EmptyState
          icon={<IconCash size={32} stroke={1.5} />}
          title="Nothing to pay yet"
          subtitle="A garage shows up here once a job is completed (or a customer doesn't turn up)."
        />
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Garages">
          {data.garages.map((row, i) => (
            <Reveal as="li" key={row.garage.id} index={i}>
              <GarageCard row={row} now={now} />
            </Reveal>
          ))}
        </ul>
      )}
    </>
  )
}
