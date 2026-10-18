/**
 * Which bookings earn the garage its payout.
 *
 * A finished job does, as it always has. Since the owner's no-show decision,
 * so does a booking the customer didn't turn up for: the garage held the slot
 * and Detlio keeps the customer's payment under the published no-show policy,
 * so the garage is paid its share as if the job had happened — the same
 * figure (computeVendorPayout), not a cut of it. A garage no-show, a decline
 * and every other cancellation earn nothing.
 *
 * Detlio Guarantee (0051): a free redo earns nothing (it is the same job,
 * done again for free), and neither does a job Detlio refunded instead of
 * redoing: the money went back to the customer, so a payout already made on
 * it comes back as a negative line (lib/payouts.ts).
 *
 * Pure: the caller passes the booking with its payment.
 */

/** Why a booking earns the garage money, as the earnings screen labels it. */
export type EarningKind = 'job' | 'customer_no_show'

export function earningKind(booking: {
  status: string
  noShow?: 'customer' | 'garage' | null
  payment?: { status: string; refundedAmount?: string | null } | null
  /** A free redo (0051). Optional: absent is false. */
  guaranteeRedo?: boolean | null
  /** Refunded instead of redone (0051), as the booking row or a read's flag says it. Optional: absent is not. */
  guaranteeRefundAt?: Date | null
  guaranteeRefund?: boolean | null
}): EarningKind | null {
  if (booking.guaranteeRedo || booking.guaranteeRefundAt || booking.guaranteeRefund) return null
  if (booking.status === 'completed') return 'job'

  // Only money Detlio actually kept is paid on. A customer no-show is never
  // refunded through the app, but a payment that was (say, ops reversed the
  // call and refunded by hand) is not money the garage can be paid from.
  const payment = booking.payment
  const kept =
    payment?.status === 'paid' && !(Number(payment.refundedAmount ?? 0) > 0)
  if (booking.status === 'cancelled' && booking.noShow === 'customer' && kept) {
    return 'customer_no_show'
  }

  return null
}
