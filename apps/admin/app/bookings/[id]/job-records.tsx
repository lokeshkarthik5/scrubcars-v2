'use client'

import { ScBadge } from '@repo/ui/sc/badge'
import { ScSection } from '@repo/ui/sc/section'
import type { AdminBookingDetail, AdminFinalBill } from '@repo/core/api/admin'
import { finalBillStatusLabel } from '@repo/core/job-records'
import { CopyButton } from '@/components/copy-button'
import { formatRupees, formatWhen } from '@/lib/bookings'

const STATUS_VARIANT: Record<AdminFinalBill['status'], 'pending' | 'success' | 'muted'> = {
  due: 'pending',
  paid: 'success',
  not_needed: 'muted',
  cancelled: 'muted',
}

/** A Razorpay id with a copy button: what ops searches the dashboard for. */
function GatewayId({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <div className="flex min-w-0 items-center">
        <span className="truncate font-numeric text-[13px] text-text-primary">{value}</span>
        <CopyButton value={value} label={`Copy ${label} ${value}`} className="-my-2 shrink-0" />
      </div>
    </div>
  )
}

/**
 * Where money paid on a bill stands, said from the same refund item the
 * Refund section above shows (lib/refunds.ts on the server decides), so the
 * two never disagree: owed and on the Refunds list, refunded, or kept
 * because the customer didn't turn up. Null when there is nothing to say.
 */
function BillMoneyLine({
  booking,
  billId,
  paidWhen,
  keptOnNoShow = false,
}: {
  booking: AdminBookingDetail
  billId: string
  /** How the payment came to be owed, before the refund part. */
  paidWhen: React.ReactNode
  /**
   * A bill that stood when it was paid is kept on a customer no-show. A
   * payment on a replaced or withdrawn bill paid for nothing, and always
   * goes back.
   */
  keptOnNoShow?: boolean
}) {
  const item = booking.refunds?.find((r) => r.kind === 'bill' && r.id === billId)

  if (item && Number(item.amountOwed) > 0) {
    return (
      // Amber: money still to give back. The action is in the Refund section.
      <p className="text-[12px] text-error">
        {paidWhen} Refund owed: <span className="font-numeric">{formatRupees(item.amountOwed)}</span>,
        see Refund above.
      </p>
    )
  }
  if (item && Number(item.amountRefunded) > 0) {
    return (
      <p className="text-[12px] text-text-secondary">
        {paidWhen} Refunded{' '}
        <span className="font-numeric">{formatRupees(item.amountRefunded)}</span>.
      </p>
    )
  }
  if (keptOnNoShow && booking.noShow === 'customer') {
    return (
      <p className="text-[12px] text-text-secondary">
        {paidWhen} Kept: customer no-show.
      </p>
    )
  }
  return null
}

/**
 * The final bill of an inspection job: the lines the garage raised, what the
 * customer had already paid, the balance and where it stands, with the
 * Razorpay ids. Bills the garage replaced are listed under it; one with a
 * payment on it was paid after it was replaced, and is a refund (shown in
 * the Refund section, and only pointed at here).
 */
export function FinalBillSection({ booking }: { booking: AdminBookingDetail }) {
  const bill = booking.finalBill ?? null
  const replaced = booking.replacedFinalBills ?? []
  if (!bill && replaced.length === 0) return null
  // A cancelled booking takes no payment for its bill (cancelling withdraws
  // an unpaid one; one from before that rule still cannot be paid), and a
  // bill paid before the cancellation is money ops has to decide about.
  const cancelled = booking.status === 'cancelled'

  return (
    <ScSection
      title="Final bill"
      action={
        bill ? (
          <ScBadge variant={STATUS_VARIANT[bill.status]}>{finalBillStatusLabel(bill.status)}</ScBadge>
        ) : undefined
      }
    >
      {bill ? (
        <>
          <ul className="flex flex-col gap-1.5">
            {bill.lines.map((line, i) => (
              <li key={i} className="flex justify-between gap-3 text-[13px]">
                <span className="text-text-primary">{line.description}</span>
                <span className="font-numeric text-text-secondary">{formatRupees(line.amount)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 border-t border-border pt-1.5 text-[13px]">
              <span className="text-text-secondary">Total</span>
              <span className="font-numeric text-text-primary">{formatRupees(bill.totalAmount)}</span>
            </li>
            <li className="flex justify-between gap-3 text-[13px]">
              <span className="text-text-secondary">Paid at booking</span>
              <span className="font-numeric text-text-secondary">−{formatRupees(bill.paidBefore)}</span>
            </li>
            <li className="flex justify-between gap-3 text-[13px] font-semibold">
              <span className="text-text-primary">
                {bill.status === 'paid'
                  ? 'Paid in the app'
                  : cancelled && bill.status === 'due'
                    ? 'Not payable: booking cancelled'
                    : 'To pay in the app'}
              </span>
              <span className="font-numeric text-text-primary">{formatRupees(bill.amountDue)}</span>
            </li>
          </ul>
          {cancelled && bill.status === 'paid' && (
            <BillMoneyLine
              booking={booking}
              billId={bill.id}
              paidWhen="The customer paid this bill before the booking was cancelled."
              keptOnNoShow
            />
          )}
          {bill.note && (
            <p className="text-[12px] text-text-secondary">
              <span className="font-medium text-text-primary">Garage&apos;s note:</span> {bill.note}
            </p>
          )}
          <p className="text-[12px] text-text-muted">
            Raised <span className="font-numeric">{formatWhen(bill.createdAt)}</span>
            {bill.paidAt && (
              <>
                {' · '}paid <span className="font-numeric">{formatWhen(bill.paidAt)}</span>
              </>
            )}
          </p>
          {(bill.gatewayOrderId || bill.gatewayPaymentId) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {bill.gatewayOrderId && <GatewayId label="Razorpay order id" value={bill.gatewayOrderId} />}
              {bill.gatewayPaymentId && (
                <GatewayId label="Razorpay payment id" value={bill.gatewayPaymentId} />
              )}
            </div>
          )}
        </>
      ) : (
        <p className="text-[13px] text-text-secondary">No bill stands on this booking.</p>
      )}

      {replaced.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-2">
          <p className="text-[12px] text-text-secondary">
            <span className="font-numeric">{replaced.length}</span> earlier{' '}
            {replaced.length === 1 ? 'bill was' : 'bills were'}{' '}
            {cancelled
              ? 'replaced by the garage or withdrawn when the booking was cancelled, before being paid.'
              : 'replaced by the garage before being paid.'}
          </p>
          {replaced
            .filter((old) => old.gatewayPaymentId)
            .map((old) => (
              <div key={old.id} className="flex flex-col gap-1">
                <BillMoneyLine
                  booking={booking}
                  billId={old.id}
                  paidWhen={
                    <>
                      A payment of{' '}
                      <span className="font-numeric">{formatRupees(old.amountDue)}</span> landed
                      after this bill {cancelled ? 'no longer stood' : 'was replaced'}.
                    </>
                  }
                />
                <GatewayId label="Razorpay payment id" value={old.gatewayPaymentId!} />
              </div>
            ))}
        </div>
      )}
    </ScSection>
  )
}

/**
 * The garage's before and after photos of the job: its evidence if the
 * customer later questions the work. Each opens full size in a new tab.
 */
export function JobPhotosSection({ booking }: { booking: AdminBookingDetail }) {
  const photos = booking.photos ?? []
  if (photos.length === 0) return null

  return (
    <ScSection title="Job photos">
      {(['before', 'after'] as const).map((stage) => {
        const ofStage = photos.filter((photo) => photo.stage === stage)
        if (ofStage.length === 0) return null
        const label = stage === 'before' ? 'Before' : 'After'
        return (
          <div key={stage} className="flex flex-col gap-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</p>
            <ul className="flex flex-wrap gap-2">
              {ofStage.map((photo, i) => (
                <li key={photo.id}>
                  <a
                    href={photo.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${label.toLowerCase()} photo ${i + 1}, taken ${formatWhen(photo.createdAt)}`}
                    className="block size-20 overflow-hidden rounded-[10px] bg-surface ring-1 ring-inset ring-border"
                  >
                    {/* A plain <img>: the garage's phone already sized it. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt="" className="h-full w-full object-cover" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </ScSection>
  )
}
