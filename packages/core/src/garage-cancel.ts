/**
 * The garage cancelling a booking it accepted (0066): the counting rule the
 * portal warns about before the garage confirms. Twin of
 * apps/server/src/lib/garage-cancel.ts (`garage-cancel.parity.test.ts`);
 * the server decides, this only says it first.
 */

/** Cancelled this close to the slot (or after it): a missed booking for the medal. */
export const GARAGE_CANCEL_LATE_HOURS = 24

export const GARAGE_CANCEL_REASON_MIN = 3
export const GARAGE_CANCEL_REASON_MAX = 200

const HOUR_MS = 60 * 60 * 1000

/** Within the late window of the slot (or after its start), as the server counts it. */
export function isLateGarageCancel(scheduledAt: Date, cancelledAt: Date): boolean {
  return scheduledAt.getTime() - cancelledAt.getTime() < GARAGE_CANCEL_LATE_HOURS * HOUR_MS
}

/** Whether the job card offers "Cancel booking": accepted, not started, car not collected. */
export function canGarageCancel(booking: {
  status: string
  bookingType: string
  pickup?: { nextStep?: string | null } | null
}): boolean {
  if (booking.status !== 'confirmed') return false
  if (booking.bookingType === 'pickup') return (booking.pickup?.nextStep ?? 'picked_up') === 'picked_up'
  return true
}
