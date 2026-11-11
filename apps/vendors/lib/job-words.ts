import { msg } from '@repo/core/i18n/translate'
import type { Booking } from '@repo/core/types'

/**
 * A job's state in the garage's words, one per colour (UX audit, garage
 * finding 7): New is the only red, Accepted is not green any more (green now
 * means only done), In progress is blue. English: the screen says
 * `t(statusLabel(b))`.
 */
export function statusLabel(b: Booking): string {
  switch (b.status) {
    case 'pending':
      return msg('New')
    case 'confirmed':
      return msg('Accepted')
    case 'in_progress':
      return msg('In progress')
    case 'completed':
      return msg('Done')
    case 'rescheduled':
      return msg('Moved')
    default:
      return msg('Cancelled')
  }
}

/**
 * Who called a job off, as the garage reads it. A Detlio cancellation says
 * whose request it was, and a no-show names who didn't turn up — the garage
 * sees its own no-shows too, since they are on its record. English, like
 * statusLabel: shown as `t(cancelledLabel(b))`.
 */
export function cancelledLabel(b: Booking): string {
  if (b.noShow === 'customer') return msg('Customer no-show')
  if (b.noShow === 'garage') return msg('Marked as garage no-show')
  // Nobody accepted it in time, so Detlio cancelled it (0042).
  if (b.notAcceptedInTime)
    return msg('Not accepted in time — cancelled and refunded')
  // None of the times the garage suggested was taken (0041).
  if (b.cancelledBy === 'vendor' && b.timeProposal?.status === 'declined') {
    return msg('None of your suggested times worked for the customer')
  }
  if (b.cancelledBy === 'vendor' && b.timeProposal?.status === 'expired') {
    return msg("The customer didn't pick one of your times in time")
  }
  // Cancelled after accepting it (0066); late ones count as missed.
  if (b.cancelledBy === 'vendor' && b.garageCancelled) {
    return b.garageCancelled.late
      ? msg('Cancelled by you after accepting · counted as a missed booking')
      : msg('Cancelled by you after accepting')
  }
  switch (b.cancelledBy) {
    case 'vendor':
      return msg('Rejected by you')
    case 'user':
      return msg('Cancelled by customer')
    case 'admin':
      return b.cancelledOnBehalfOf === 'customer'
        ? msg("Cancelled by Detlio at the customer's request")
        : b.cancelledOnBehalfOf === 'garage'
          ? msg('Cancelled by Detlio at your request')
          : msg('Cancelled by Detlio')
    default:
      return msg('Cancelled')
  }
}
