import type { AdminRefund, RefundKind } from '@repo/core/api/admin'

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
 * The refund a "Mark refunded…" dialog should show: the latest copy of the
 * one that was clicked, from the list as it is now. Gone from the Owed list
 * means a refetch found nothing left owed on it, so the clicked copy is
 * shown as settled rather than with figures that no longer hold.
 */
export function latestRefund(list: AdminRefund[], picked: AdminRefund): AdminRefund {
  const fresh = list.find((r) => r.kind === picked.kind && r.id === picked.id)
  return fresh ?? { ...picked, amountOwed: '0.00', amountRefunded: picked.amountPaid }
}
