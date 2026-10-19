'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconDownload } from '@tabler/icons-react'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { ScCard } from '@repo/ui/sc/card'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { PageHeader } from '@repo/ui/sc/page-header'
import { ScSection } from '@repo/ui/sc/section'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { StatTile } from '@repo/ui/sc/stat-tile'
import type {
  AdminGaragePayouts,
  AdminPayout,
  PayoutLine,
} from '@repo/core/api/admin'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { useAdminGaragePayouts } from '@repo/core/api/hooks/use-admin-payouts'
import { downloadCsv, toCsv } from '@repo/core/csv'
import { useNow } from '@repo/core/hooks/use-now'
import { istDateTimeLabel } from '@repo/core/ist-input'
import {
  LINE_STATUS_LABEL,
  PAYOUT_METHOD_LABEL,
  commissionLabel,
  istDateLabel,
  lineKindLabel,
  rupeesLabel,
  statementCsvRows,
  waitedLabel,
} from '@repo/core/payouts'
import { cn } from '@repo/core/utils'
import { CopyButton } from '@/components/copy-button'
import { RecordPayoutDialog } from '@/components/record-payout-dialog'
import { todayIst } from '@/lib/bookings'

/** The garage's statement and its payouts, as one file each. */
function exportStatement(data: AdminGaragePayouts) {
  const slug = data.garage.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const { header, rows } = statementCsvRows(data.lines)
  downloadCsv(toCsv(header, rows), `detlio-statement-${slug}-${todayIst()}.csv`)
}

function exportPayouts(data: AdminGaragePayouts) {
  const slug = data.garage.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const csv = toCsv(
    [
      'Paid at (IST)',
      'Amount',
      'Method',
      'Reference',
      'Bookings',
      'Covers from',
      'Covers up to',
      'Recorded by',
      'Note',
    ],
    data.payouts.map((payout) => [
      istDateTimeLabel(payout.paidAt),
      payout.amount.toFixed(2),
      PAYOUT_METHOD_LABEL[payout.method],
      payout.reference,
      payout.items.map((item) => `#${item.reference}`).join(' '),
      istDateTimeLabel(payout.coversFrom),
      istDateTimeLabel(payout.coversUpTo),
      payout.recordedBy,
      payout.note,
    ])
  )
  downloadCsv(csv, `detlio-payouts-${slug}-${todayIst()}.csv`)
}

function AccountRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center rounded-[10px] border border-border px-3">
      <span className="text-[12px] text-text-secondary">{label}</span>
      <span className="ml-2 truncate font-numeric text-[13px] text-text-primary">
        {value}
      </span>
      <CopyButton
        value={value}
        label={`Copy ${label.toLowerCase()} ${value}`}
        className="ml-auto shrink-0"
      />
    </div>
  )
}

function DueRow({ line }: { line: PayoutLine }) {
  const kind = lineKindLabel(line.kind)
  return (
    <li className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-[13px] text-text-primary">
          <span className="font-numeric">#{line.reference}</span> ·{' '}
          {line.services.join(' + ') || 'Booking'}
        </p>
        <p className="text-[12px] text-text-secondary">
          <span className="font-numeric">
            {istDateTimeLabel(line.payableFrom)}
          </span>{' '}
          · {line.customerFirstName} · price{' '}
          <span className="font-numeric">{rupeesLabel(line.price)}</span> ·{' '}
          {commissionLabel(line, 'admin')}
          {line.heldByGarage > 0 && (
            <>
              {' '}
              · cash at garage{' '}
              <span className="font-numeric">
                {rupeesLabel(line.heldByGarage)}
              </span>
            </>
          )}
        </p>
        {kind && (
          <ScBadge variant="muted" className="mt-1">
            {kind}
          </ScBadge>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <p
          className={cn(
            'font-numeric text-[13px] font-semibold',
            line.balance < 0 ? 'text-error' : 'text-text-primary'
          )}
        >
          {rupeesLabel(line.balance)}
        </p>
        <p className="text-[12px] text-text-muted">
          {LINE_STATUS_LABEL[line.status]}
        </p>
      </div>
    </li>
  )
}

function PayoutCard({ payout }: { payout: AdminPayout }) {
  return (
    <ScCard className="flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-text-primary">
            {PAYOUT_METHOD_LABEL[payout.method]} ·{' '}
            <span className="font-numeric">
              {istDateTimeLabel(payout.paidAt)}
            </span>
          </p>
          <p className="truncate text-[12px] text-text-secondary">
            Ref{' '}
            <span className="font-numeric text-text-primary">
              {payout.reference}
            </span>{' '}
            · recorded by {payout.recordedBy}
          </p>
        </div>
        <p className="font-numeric text-[14px] font-bold text-success">
          {rupeesLabel(payout.amount)}
        </p>
      </div>
      {payout.note && (
        <p className="text-[12px] text-text-secondary">{payout.note}</p>
      )}
      <details className="text-[12px]">
        <summary className="min-h-11 cursor-pointer py-2 text-text-secondary">
          {payout.items.length}{' '}
          {payout.items.length === 1 ? 'booking' : 'bookings'}, due{' '}
          <span className="font-numeric">
            {istDateLabel(payout.coversFrom)}
          </span>{' '}
          to{' '}
          <span className="font-numeric">
            {istDateLabel(payout.coversUpTo)}
          </span>
        </summary>
        <ul className="flex flex-col gap-1 pb-1">
          {payout.items.map((item) => (
            <li key={item.bookingId} className="flex justify-between gap-3">
              <span className="text-text-secondary">
                <span className="font-numeric text-text-primary">
                  #{item.reference}
                </span>{' '}
                · price{' '}
                <span className="font-numeric">{rupeesLabel(item.price)}</span>{' '}
                ·{' '}
                {item.freePosition !== null ? (
                  `free (${item.freePosition} of 25)`
                ) : (
                  <>
                    commission{' '}
                    <span className="font-numeric">
                      {rupeesLabel(item.commission)}
                    </span>
                  </>
                )}
              </span>
              <span className="font-numeric text-text-primary">
                {rupeesLabel(item.amount)}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </ScCard>
  )
}

function GaragePayouts({ id }: { id: string }) {
  const router = useRouter()
  const now = new Date(useNow(60_000))
  const { data, isPending, error, refetch } = useAdminGaragePayouts(id)
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  if (isPending) return <SkeletonList count={3} itemClassName="h-32" />
  if (!data) {
    return (
      <ErrorState
        message={errorMessage(error, "Couldn't load this garage's payouts")}
        onRetry={() => void refetch()}
      />
    )
  }

  const { summary, payable, account } = data
  const owesDetlio = summary.balanceDue < 0

  return (
    <>
      <PageHeader
        title={data.garage.name}
        subtitle={
          data.garage.deleted
            ? 'Deleted garage, kept for its money.'
            : data.garage.inBin
              ? 'In the Bin. It can still be paid what it earned.'
              : `Payouts within ${data.cycleHours} hours of each job.`
        }
        showBack
        backHref="/payouts"
        actions={
          <div className="flex flex-wrap gap-2">
            <ScButton
              variant="secondary"
              fullWidth={false}
              onClick={() => exportStatement(data)}
              disabled={data.lines.length === 0}
              className="flex min-h-11 items-center gap-1.5 px-3 text-[12px]"
            >
              <IconDownload size={15} aria-hidden="true" /> Statement
            </ScButton>
            <ScButton
              variant="secondary"
              fullWidth={false}
              onClick={() => exportPayouts(data)}
              disabled={data.payouts.length === 0}
              className="flex min-h-11 items-center gap-1.5 px-3 text-[12px]"
            >
              <IconDownload size={15} aria-hidden="true" /> Payouts
            </ScButton>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-2">
        <StatTile
          label={owesDetlio ? 'Owes Detlio' : 'Balance due'}
          tone={summary.overdue ? 'warning' : 'default'}
          value={rupeesLabel(Math.abs(summary.balanceDue))}
        />
        <StatTile label="Bookings" value={summary.bookingsDue} />
        <StatTile
          label="Oldest"
          tone={summary.overdue ? 'warning' : 'default'}
          value={
            summary.oldestUnpaidAt
              ? waitedLabel(summary.oldestUnpaidAt, now)
              : '—'
          }
          hint={summary.overdue ? 'Past 24 hours' : undefined}
        />
      </div>

      <ScSection
        title="Pay to"
        action={
          !data.garage.deleted && (
            <Link
              href={`/vendors/${id}/edit`}
              className="min-h-11 py-3 text-[12px] text-text-secondary underline"
            >
              Edit details
            </Link>
          )
        }
      >
        {account ? (
          <div className="flex flex-col gap-2">
            {account.accountName && (
              <AccountRow label="Name" value={account.accountName} />
            )}
            {account.accountNumber && (
              <AccountRow label="Account" value={account.accountNumber} />
            )}
            {account.ifsc && <AccountRow label="IFSC" value={account.ifsc} />}
            {account.upiId && <AccountRow label="UPI" value={account.upiId} />}
          </div>
        ) : (
          <p className="text-[12px] text-text-secondary">
            No payout details yet. Add the garage&apos;s bank account or UPI id
            on its page.
          </p>
        )}
      </ScSection>

      <ScSection title="Due now">
        {payable.refusal === 'owed_back' ? (
          <p className="text-[12px] text-text-secondary">
            This garage owes Detlio{' '}
            <span className="font-numeric text-text-primary">
              {rupeesLabel(-summary.balanceDue)}
            </span>{' '}
            (refunds after a payout, or commission on cash it collected). It
            comes off its next payout.
          </p>
        ) : payable.refusal === 'nothing_due' ? (
          <p className="text-[12px] text-text-secondary">
            Nothing is due to this garage now.
          </p>
        ) : (
          <ScButton onClick={() => setRecording(true)} className="min-h-11">
            Record payout of {rupeesLabel(payable.amount)}
          </ScButton>
        )}
        {data.due.length > 0 && (
          <ul aria-label="Bookings due">
            {data.due.map((line) => (
              <DueRow key={line.bookingId} line={line} />
            ))}
          </ul>
        )}
        <p className="text-[12px] text-text-muted">
          Commission-free bookings used:{' '}
          <span className="font-numeric">{data.freeBookings.used}</span> of{' '}
          <span className="font-numeric">{data.freeBookings.of}</span>.
        </p>
      </ScSection>

      <ScSection title="Payout history">
        {data.payouts.length === 0 ? (
          <p className="text-[12px] text-text-secondary">
            No payouts recorded yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.payouts.map((payout) => (
              <PayoutCard key={payout.id} payout={payout} />
            ))}
          </div>
        )}
      </ScSection>

      {!data.garage.deleted && (
        <ScButtonLink
          href={`/vendors/${id}/edit`}
          variant="secondary"
          className="min-h-11"
        >
          Open the garage
        </ScButtonLink>
      )}

      {recording && (
        <RecordPayoutDialog
          data={data}
          open
          onClose={() => setRecording(false)}
        />
      )}
    </>
  )
}

export default function AdminGaragePayoutsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return <GaragePayouts id={id} />
}
