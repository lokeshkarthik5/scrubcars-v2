'use client'

import { useRef, useState } from 'react'
import { IconCircleCheck, IconLoader2 } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { getBooking } from '@repo/core/api/bookings'
import { payFinalBill, verifyFinalBillPayment } from '@repo/core/api/job-records'
import { formatRupees } from '@repo/core/job-records'
import { confirmPayment, finalBillPollResult, realClock } from '@repo/core/payment-confirmation'
import { openRazorpayCheckout, RazorpayReportedError } from '@repo/core/razorpay'
import type { Booking, FinalBill } from '@repo/core/types'
import { APP_TIMEZONE } from '@repo/core/utils'
import { PaymentReceivedPanel, paymentReceivedText } from '@/components/payment-received-panel'

function paidOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: APP_TIMEZONE,
  })
}

/**
 * Where paying one bill stands, once Razorpay has reported it paid. Kept by
 * the booking page, keyed by the bill's id, not by this card: the garage can
 * replace the bill while the customer is in the Razorpay sheet, the page's
 * poll then swaps this card for the new bill's, and the outcome of the old
 * payment — "this payment will be refunded", with its payment id — must
 * outlive the card it started on.
 */
export interface BillPayment {
  paymentId: string
  phase: 'confirming' | 'paid' | 'unconfirmed' | 'failed'
  refundMessage?: string
}

interface FinalBillCardProps {
  booking: Booking
  bill: FinalBill
  /** Where paying this bill stands, from the page; unset until Razorpay reports it paid. */
  payment?: BillPayment
  /** Tells the page where paying this bill stands. */
  onPayment: (chargeId: string, payment: BillPayment) => void
  /** The booking as it reads after the bill is paid, to replace the page's copy. */
  onUpdated: (booking: Booking) => void
  /** The profile, for Razorpay's prefill. */
  customer?: { name?: string; phone?: string }
}

/**
 * The final bill of an inspection job: what the work came to, what was paid
 * at booking, and what is left — paid here, in the app, like the booking was.
 *
 * Paying follows the same rule as Pay Now on this page (see
 * @repo/core/payment-confirmation): once Razorpay reports the bill paid, the
 * Pay button is gone for good, whatever the confirm call does next. The
 * Razorpay webhook settles the same payment on its own, so a dropped
 * connection ends in "we have your payment", never in a second charge.
 */
export function FinalBillCard({
  booking,
  bill,
  payment: paid,
  onPayment,
  onUpdated,
  customer,
}: FinalBillCardProps) {
  const [opening, setOpening] = useState(false)
  // Set once Razorpay reports the bill paid, and never cleared. The page's
  // copy (`paid`) is the lasting one; this closes the gap before it renders.
  const paidRef = useRef(false)
  const setPaid = (next: BillPayment) => onPayment(bill.id, next)

  const handlePay = async () => {
    if (opening || paidRef.current || paid || bill.status !== 'due') return
    setOpening(true)
    try {
      const order = await payFinalBill(booking.id, bill.id)
      await openRazorpayCheckout({
        order,
        description: `Final bill at ${booking.vendorName}`,
        customer,
        onSuccess: async (response) => {
          const paymentId = response.razorpay_payment_id
          paidRef.current = true
          setPaid({ paymentId, phase: 'confirming' })

          const outcome = await confirmPayment({
            verify: async () => {
              await verifyFinalBillPayment(booking.id, bill.id, {
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: paymentId,
                razorpaySignature: response.razorpay_signature,
              })
              return { bookingId: booking.id }
            },
            poll: async () => {
              const fresh = await getBooking(booking.id)
              // getBooking answers undefined for any failure; keep looking.
              if (!fresh) return { kind: 'pending' }
              return finalBillPollResult(booking.id, bill.id, fresh.finalBill, fresh.status)
            },
            ...realClock,
          })

          if (outcome.kind === 'booked') {
            const updated = await getBooking(booking.id)
            if (updated) onUpdated(updated)
            setPaid({ paymentId, phase: 'paid' })
            toast.success('Final bill paid')
          } else {
            setPaid({
              paymentId,
              phase: outcome.kind,
              refundMessage: outcome.kind === 'failed' ? outcome.message : undefined,
            })
            // Said out loud as well: when the garage replaced the bill, the
            // new one takes this card's place on the next refresh, and the
            // page keeps this outcome above it.
            if (outcome.kind === 'failed') toast.error(outcome.message)
          }
        },
        onDismiss: () => {
          toast.info('Payment cancelled. You can pay the bill any time from this page.')
        },
        onFailure: (message) => {
          toast.error(message)
        },
      })
    } catch (error) {
      if (!(error instanceof RazorpayReportedError) && error instanceof Error) {
        toast.error(error.message)
      }
    } finally {
      setOpening(false)
    }
  }

  // The page's poll can show the bill paid after we stopped watching; the
  // panel then gives way to "Paid on", as on Pay Now.
  const settled = bill.status === 'paid' || paid?.phase === 'paid'
  const showPanel = !settled && (paid?.phase === 'unconfirmed' || paid?.phase === 'failed')

  // Paid at booking, split when a promo code was used: the bill credits the
  // booking's full price, and the customer should see their discount kept
  // rather than a "paid" figure larger than what they paid.
  const discount =
    bill.paidBefore > 0 && booking.discountAmount > 0
      ? Math.min(booking.discountAmount, bill.paidBefore)
      : 0

  return (
    <ScCard className="flex flex-col gap-3 px-4 py-4">
      <h2 className="text-sm font-semibold text-text-primary">Final bill</h2>
      <p className="-mt-2 text-[12px] text-text-secondary">
        From {booking.vendorName}, after inspecting your car.
      </p>

      <ul className="flex flex-col gap-1.5">
        {bill.lines.map((line, i) => (
          <li key={i} className="flex items-start justify-between gap-3 text-[13px]">
            <span className="min-w-0 text-text-secondary">{line.description}</span>
            <span className="shrink-0 font-numeric font-medium text-text-primary">
              {formatRupees(line.amount)}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1.5 border-t border-border pt-3 text-[13px]">
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Total</span>
          <span className="font-numeric font-medium text-text-primary">
            {formatRupees(bill.total)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Paid at booking</span>
          <span className="font-numeric font-medium text-text-primary">
            −{formatRupees(bill.paidBefore - discount)}
          </span>
        </div>
        {discount > 0 && (
          <div className="flex items-center justify-between text-success">
            <span>Discount{booking.discountCode ? ` (${booking.discountCode})` : ''}</span>
            <span className="font-numeric font-medium">−{formatRupees(discount)}</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border pt-2 text-[15px] font-semibold text-text-primary">
          {/* Settled, the figure is what was paid here, not a balance. */}
          <span>{settled ? 'Paid in the app' : 'To pay'}</span>
          <span className="font-numeric font-bold">{formatRupees(bill.amountDue)}</span>
        </div>
      </div>

      {bill.note && (
        <p className="text-[12px] text-text-secondary">
          <span className="font-medium text-text-primary">Garage&apos;s note:</span> {bill.note}
        </p>
      )}

      {/* Announces each step after payment; on the page from the start so the
          change is read out (see the same region on the booking page). */}
      <p role="status" className="sr-only">
        {paid?.phase === 'confirming'
          ? 'Payment received. Confirming your bill.'
          : settled && paid
            ? 'Final bill paid.'
            : showPanel && paid
              ? paymentReceivedText(paid.paymentId, paid.refundMessage, 'bill_not_marked_paid')
              : ''}
      </p>

      {bill.status === 'not_needed' ? (
        <p className="flex items-start gap-1.5 text-[13px] text-text-primary">
          <IconCircleCheck size={16} className="mt-0.5 shrink-0 text-success" aria-hidden />
          <span>
            Nothing more to pay. The work came to no more than you paid at booking.
          </span>
        </p>
      ) : settled ? (
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-success">
          <IconCircleCheck size={16} aria-hidden />
          Paid on{' '}
          <span className="font-numeric">{paidOn(bill.paidAt ?? new Date().toISOString())}</span>
        </p>
      ) : paid?.phase === 'confirming' ? (
        // Graphite with a spinner, not red: a red button that does nothing
        // gets tapped again and again on a phone.
        <ScButton
          disabled
          className="flex items-center justify-center gap-2 rounded-full bg-surface-elevated py-4 text-[15px] text-text-primary ring-1 ring-inset ring-border hover:bg-surface-elevated disabled:cursor-wait disabled:opacity-100"
        >
          <IconLoader2 size={16} className="shrink-0 animate-spin" aria-hidden="true" />
          Payment received — confirming…
        </ScButton>
      ) : showPanel && paid ? (
        <PaymentReceivedPanel
          paymentId={paid.paymentId}
          refundMessage={paid.phase === 'failed' ? paid.refundMessage : undefined}
          waitingOn="bill_not_marked_paid"
        />
      ) : booking.status === 'cancelled' ? null : (
        <ScButton
          disabled={opening}
          onClick={handlePay}
          className="rounded-full py-4 text-[15px]"
        >
          {opening ? (
            'Opening payment...'
          ) : (
            <>
              Pay <span className="font-numeric font-bold">{formatRupees(bill.amountDue)}</span>
            </>
          )}
        </ScButton>
      )}
    </ScCard>
  )
}
