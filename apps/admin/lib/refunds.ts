import type { AdminRefund, DeletedTestPayment, RefundKind } from '@repo/core/api/admin'
import { toCsv } from '@repo/core/csv'

/**
 * Wording for the Refunds page and a booking's refund section. Admin-only,
 * so it lives in the app; the customer's words are in @repo/core/refunds.
 */

/** What the money was paid for, in a few words. */
export const REFUND_KIND_LABEL: Record<RefundKind, string> = {
  booking: 'Booking payment',
  checkout: 'Payment with no booking',
  bill: 'Final bill payment',
}

/**
 * What a refund is of, as the list and the dialogs say it: a bill names
 * whether it was the final bill or extra work (0041), both kind 'bill'.
 */
export function refundKindLabel(refund: Pick<AdminRefund, 'kind' | 'chargeKind'>): string {
  if (refund.kind === 'bill' && refund.chargeKind === 'extra_work') return 'Extra work payment'
  return REFUND_KIND_LABEL[refund.kind]
}

/**
 * The refund a "Mark refunded…" dialog should show: the latest copy of the
 * one that was clicked, from the list as it is now. Gone from the Owed list
 * means a refetch found nothing left owed on it, so the clicked copy is
 * shown as settled rather than with figures that no longer hold.
 */
export function latestRefund(list: AdminRefund[], picked: AdminRefund): AdminRefund {
  const fresh = list.find((r) => r.kind === picked.kind && r.id === picked.id)
  return fresh ?? { ...picked, amountOwed: '0.00', amountRefunded: picked.amountPaid }
}

/**
 * The team tests' ledger (0065) as a CSV: every real payment deleted with a
 * Test booking, what was refunded on it, who deleted it and why. Ids and
 * amounts only, as the API sends them. Since the owner's delete (0069) a row
 * may be money not refunded or a garage payout's line, so the last columns
 * say where each stands; an older API's rows read as refunded.
 */
export function deletedTestPaymentsCsv(rows: DeletedTestPayment[]): string {
  return toCsv(
    [
      'Deleted at',
      'Deleted by',
      'Reason',
      'Booking',
      'What',
      'Razorpay payment',
      'Razorpay order',
      'Mode',
      'Amount',
      'Refunded',
      'Refund ids',
      'Receipt',
      'Garage',
      'Paid at',
      'Booked at',
      'Audit record',
      'Money',
      'Note',
      'Credit returned',
    ],
    rows.map((row) => [
      row.deletedAt,
      row.deletedBy,
      row.reason,
      `#${row.bookingReference}`,
      DELETED_PAYMENT_KIND[row.kind],
      row.razorpayPaymentId,
      row.razorpayOrderId,
      row.gatewayMode,
      row.amount,
      row.refundedAmount,
      row.refundIds.join(' '),
      row.receiptNumber,
      row.garageName,
      row.paidAt,
      row.bookedAt,
      row.auditId,
      LEDGER_STATE[row.state ?? 'refunded'],
      row.note ?? '',
      row.creditReturned && Number(row.creditReturned) > 0 ? row.creditReturned : '',
    ])
  )
}

/** Where a ledger row's money stands, in the CSV's words. */
const LEDGER_STATE: Record<NonNullable<DeletedTestPayment['state']>, string> = {
  refunded: 'Refunded',
  not_refunded: 'Not refunded',
  refund_pending: 'Refund processing',
  credit_returned: 'Credit given back',
  paid_out: 'Paid out to the garage',
}

const DELETED_PAYMENT_KIND: Record<DeletedTestPayment['kind'], string> = {
  booking: 'Booking payment',
  final_bill: 'Final bill',
  extra_work: 'Extra work',
  payout: 'Garage payout line',
}
