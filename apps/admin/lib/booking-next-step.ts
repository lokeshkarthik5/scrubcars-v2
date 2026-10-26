/**
 * The Bookings table's Next step column (pattern 03): what ops must do about
 * a booking, and by when, on the panel's one clock scale (red-orange late or
 * under 15 minutes, amber today, grey otherwise). Pure, tested in
 * booking-next-step.test.ts.
 */
import type { AdminBooking } from '@repo/core/api/admin'
import { formatWaiting, pickupStepLine } from './bookings'
import { ageText, deadlineText, formatMoney, type Urgency } from './format'

export interface BookingNextStep {
  text: string
  /** A quieter second line ("Waiting 45 min"). */
  detail: string | null
  urgency: Urgency
}

type StepFields = Pick<
  AdminBooking,
  | 'status'
  | 'waitingMins'
  | 'scheduledAt'
  | 'cancelledAt'
  | 'noShow'
  | 'pickup'
  | 'startedAt'
> &
  Partial<
    Pick<
      AdminBooking,
      'respondBy' | 'refundOwed' | 'billDue' | 'notAcceptedInTime'
    >
  >

/** A confirmed job this long past its slot with no start is worth a look. */
const NOT_STARTED_AFTER_MS = 30 * 60 * 1000

/**
 * The one thing to do now, most pressing first: money owed back; a garage
 * that hasn't accepted (its deadline, and how long the customer has
 * waited); a bill the customer still owes; a job not started well past its
 * slot; where a pickup car is. Null when nothing is asked of ops.
 */
export function bookingNextStep(
  b: StepFields,
  now: number
): BookingNextStep | null {
  if (b.refundOwed) {
    const age = b.cancelledAt ? ageText(b.cancelledAt, now, 'Owed') : null
    return {
      text: `Refund ${formatMoney(b.refundOwed)}`,
      detail: age?.text || null,
      // Always at least amber: someone has to do it in Razorpay.
      urgency: age && age.urgency !== 'neutral' ? age.urgency : 'attention',
    }
  }

  if (b.status === 'pending') {
    const waiting =
      b.waitingMins !== null ? `Waiting ${formatWaiting(b.waitingMins)}` : null
    if (b.respondBy) {
      const deadline = deadlineText(b.respondBy, now, { verb: 'Accept' })
      if (deadline.text)
        return {
          text: `Garage to accept · ${deadline.text}`,
          detail: waiting,
          urgency: deadline.urgency,
        }
    }
    return {
      text: 'Garage to accept',
      detail: waiting,
      urgency:
        b.waitingMins !== null && b.waitingMins >= 30 ? 'late' : 'attention',
    }
  }

  if (b.billDue) {
    return {
      text: `Bill due ${formatMoney(b.billDue)}`,
      detail: null,
      urgency: 'attention',
    }
  }

  if (b.status === 'cancelled') {
    if (b.notAcceptedInTime)
      return { text: 'Not accepted in time', detail: null, urgency: 'neutral' }
    if (b.noShow)
      return {
        text: b.noShow === 'customer' ? 'Customer no-show' : 'Garage no-show',
        detail: null,
        urgency: 'neutral',
      }
    return null
  }

  if (b.status === 'confirmed' && !b.startedAt) {
    const late = now - Date.parse(b.scheduledAt)
    if (late > NOT_STARTED_AFTER_MS)
      return {
        text: 'Not started',
        detail: 'Past its slot',
        urgency: 'attention',
      }
  }

  if (b.pickup && b.status !== 'completed') {
    const step = pickupStepLine(b.pickup)
    if (step) return { text: step, detail: null, urgency: 'neutral' }
  }
  return null
}

/** The row's coloured edge: red-orange when the next step is late. */
export function bookingRowTone(
  step: BookingNextStep | null
): 'urgent' | 'attention' | null {
  if (!step) return null
  if (step.urgency === 'late') return 'urgent'
  return step.urgency === 'attention' ? 'attention' : null
}
