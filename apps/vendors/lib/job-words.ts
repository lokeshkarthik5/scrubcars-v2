import type { Booking } from '@repo/core/types'

/**
 * A job's state in the garage's words, one per colour (UX audit, garage
 * finding 7): New is the only red, Accepted is not green any more (green now
 * means only done), In progress is blue.
 */
export function statusLabel(b: Booking): string {
  switch (b.status) {
    case 'pending':
      return 'New'
    case 'confirmed':
      return 'Accepted'
    case 'in_progress':
      return 'In progress'
    case 'completed':
      return 'Done'
    default:
      return 'Cancelled'
  }
}

/**
 * Who called a job off, as the garage reads it. A Detlio cancellation says
 * whose request it was, and a no-show names who didn't turn up — the garage
 * sees its own no-shows too, since they are on its record.
 */
export function cancelledLabel(b: Booking): string {
  if (b.noShow === 'customer') return 'Customer no-show'
  if (b.noShow === 'garage') return 'Marked as garage no-show'
  // Nobody accepted it in time, so Detlio cancelled it (0042).
  if (b.notAcceptedInTime)
    return 'Not accepted in time — cancelled and refunded'
  // None of the times the garage suggested was taken (0041).
  if (b.cancelledBy === 'vendor' && b.timeProposal?.status === 'declined') {
    return 'None of your suggested times worked for the customer'
  }
  if (b.cancelledBy === 'vendor' && b.timeProposal?.status === 'expired') {
    return "The customer didn't pick one of your times in time"
  }
  switch (b.cancelledBy) {
    case 'vendor':
      return 'Rejected by you'
    case 'user':
      return 'Cancelled by customer'
    case 'admin':
      return b.cancelledOnBehalfOf === 'customer'
        ? "Cancelled by Detlio at the customer's request"
        : b.cancelledOnBehalfOf === 'garage'
          ? 'Cancelled by Detlio at your request'
          : 'Cancelled by Detlio'
    default:
      return 'Cancelled'
  }
}
