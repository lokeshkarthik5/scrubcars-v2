'use client'

import Link from 'next/link'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import type { AdminRefund } from '@repo/core/api/admin'
import { refundOwedAge } from '@repo/core/refunds'
import { cn } from '@repo/core/utils'
import { CopyButton } from '@/components/copy-button'
import { Meta } from '@/components/meta'
import { PhoneLink } from '@/components/phone-link'
import { formatRupees, formatWhen } from '@/lib/bookings'
import { refundKindLabel } from '@/lib/refunds'

/** A Razorpay id ops pastes into the dashboard, with a copy button. */
function GatewayId({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 items-center">
      <span className="truncate font-numeric text-text-primary">{value}</span>
      <CopyButton
        value={value}
        label={`Copy ${label} ${value}`}
        className="-my-2 shrink-0"
      />
    </div>
  )
}

/**
 * One refund, owed or done: how much, for how long, whose money, the
 * Razorpay payment to refund and why — and, once done, the refund id, when
 * and who. While anything is still owed, "Refund now…" sends it through
 * Razorpay (when there is a Razorpay payment to refund) and "Mark
 * refunded…" records one done by hand in the dashboard.
 *
 * `linkBooking` is off on a booking's own page, where the link would lead
 * back to where you are.
 */
export function RefundCard({
  refund: r,
  now,
  onMark,
  onRefundNow,
  linkBooking = true,
  className,
}: {
  refund: AdminRefund
  now: number
  onMark: (refund: AdminRefund) => void
  onRefundNow?: (refund: AdminRefund) => void
  linkBooking?: boolean
  className?: string
}) {
  const owed = Number(r.amountOwed) > 0
  const refunded = Number(r.amountRefunded) > 0
  const age = refundOwedAge(r.since, now)

  return (
    <ScCard className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <p className="text-[12px] text-text-secondary">
            {refundKindLabel(r)} ·{' '}
            {r.bookingId && linkBooking ? (
              <Link
                href={`/bookings/${r.bookingId}`}
                aria-label={`Open booking #${r.reference}`}
                className="inline-flex min-h-11 items-center font-numeric font-medium text-text-primary underline underline-offset-2"
              >
                #{r.reference}
              </Link>
            ) : (
              <span className="font-numeric text-text-primary">
                #{r.reference}
              </span>
            )}
          </p>
          <p className="text-[13px] text-text-primary">{r.reason}</p>
        </div>
        <div className="text-right">
          <p className="font-numeric text-[20px] font-semibold leading-7 text-text-primary">
            {formatRupees(owed ? r.amountOwed : r.amountRefunded)}
          </p>
          {owed ? (
            <ScBadge variant={age.late ? 'danger' : 'pending'}>
              {age.label}
            </ScBadge>
          ) : (
            <ScBadge variant="muted">Refunded</ScBadge>
          )}
        </div>
      </div>

      {owed && refunded && (
        <p className="text-[12px] text-text-secondary">
          <span className="font-numeric text-text-primary">
            {formatRupees(r.amountRefunded)}
          </span>{' '}
          of <span className="font-numeric">{formatRupees(r.amountPaid)}</span>{' '}
          refunded so far.
        </p>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
        <Meta label="Customer">
          <p className="truncate text-text-primary">{r.customer.name}</p>
          <PhoneLink phone={r.customer.phone} name={r.customer.name} />
        </Meta>
        <Meta label="Garage">
          <p className="line-clamp-2 text-text-primary">{r.garageName}</p>
        </Meta>
        <Meta label="Razorpay payment">
          {r.razorpayPaymentId ? (
            <GatewayId
              value={r.razorpayPaymentId}
              label="Razorpay payment id"
            />
          ) : (
            <p>Not recorded</p>
          )}
        </Meta>
        <Meta label="Paid">
          <p className="font-numeric text-text-primary">
            {formatRupees(r.amountPaid)}
          </p>
        </Meta>
      </div>

      {refunded && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-2 md:grid-cols-4">
          <Meta label={r.outsideRazorpay ? 'Refunded' : 'Razorpay refund'}>
            {r.refundRef ? (
              <GatewayId value={r.refundRef} label="Razorpay refund id" />
            ) : (
              <p className="text-text-primary">Outside Razorpay</p>
            )}
          </Meta>
          <Meta label="Recorded">
            {r.refundedAt && (
              <p className="font-numeric">{formatWhen(r.refundedAt)}</p>
            )}
            {r.refundedBy && <p>by {r.refundedBy}</p>}
          </Meta>
          {r.refundNote && (
            <div className="col-span-2">
              <Meta label="Note">
                <p className="whitespace-pre-line">{r.refundNote}</p>
              </Meta>
            </div>
          )}
        </div>
      )}

      {owed && (
        <div className="flex flex-wrap gap-2">
          {/* Only a Razorpay payment (pay_…) can be refunded from here. */}
          {onRefundNow && r.razorpayPaymentId?.startsWith('pay_') && (
            <ScButton
              fullWidth={false}
              onClick={() => onRefundNow(r)}
              aria-label={`Refund now: #${r.reference}, ${formatRupees(r.amountOwed)} owed`}
              className="min-h-11 px-4 text-[13px]"
            >
              Refund now…
            </ScButton>
          )}
          <ScButton
            variant="secondary"
            fullWidth={false}
            onClick={() => onMark(r)}
            aria-label={`Mark refunded: #${r.reference}, ${formatRupees(r.amountOwed)} owed`}
            className="min-h-11 px-4 text-[13px]"
          >
            Mark refunded…
          </ScButton>
        </div>
      )}
    </ScCard>
  )
}
