import { formatStepTime } from '@repo/core/job-records'
import { BANK_DAYS, customerRefundLine } from '@repo/core/refunds'
import type { BookingRefund, ResponseDeadline } from '@repo/core/types'

/**
 * How the garage response deadline (0042) reads in the garage portal and
 * the customer app. The server works the deadline out
 * (apps/server/src/lib/response-deadline.ts) and sends it with the switch,
 * so neither app promises a cancellation the server won't make. Pure; the
 * clock is passed in.
 */

/** The garage's countdown turns amber in its last five minutes. */
export const RESPONSE_AMBER_MS = 5 * 60 * 1000

const MINUTE_MS = 60 * 1000

export type GarageCountdown =
  /** "Accept by 9:30 am": the clock has not started yet (the garage is shut), or has a while to run. */
  | { kind: 'by'; text: string; amber: false }
  /** "Accept within 12 min", amber in the last five. */
  | { kind: 'within'; text: string; amber: boolean }
  /** Past it. With the switch on the booking is being cancelled; off, it is only late. */
  | { kind: 'passed'; text: string; amber: false; enforced: boolean }

/**
 * The line on a pending job card. Further off than the window itself (the
 * clock starts when the garage next opens, or the window spans a closing),
 * it names the time; within the window it counts down in whole minutes,
 * rounded up so "within 1 min" is the last thing it says.
 */
export function garageCountdown(deadline: ResponseDeadline, now: number): GarageCountdown {
  const at = new Date(deadline.respondBy).getTime()
  const left = at - now
  if (left <= 0) {
    return deadline.enforced
      ? { kind: 'passed', text: 'Not accepted in time — cancelled and refunded', amber: false, enforced: true }
      : { kind: 'passed', text: `Accept as soon as you can — it was due by ${formatStepTime(deadline.respondBy, now)}`, amber: false, enforced: false }
  }
  if (left > deadline.windowMins * MINUTE_MS) {
    return { kind: 'by', text: `Accept by ${formatStepTime(deadline.respondBy, now)}`, amber: false }
  }
  const minutes = Math.max(1, Math.ceil(left / MINUTE_MS))
  return { kind: 'within', text: `Accept within ${minutes} min`, amber: left <= RESPONSE_AMBER_MS }
}

/**
 * The customer's line while their paid booking waits for the garage:
 * "Waiting for Marina Auto Spa to accept — by 10:42 am". Without a time
 * when there is no deadline, or once it has passed (the booking is then
 * being cancelled, which `pendingNote` says, or, with the switch off, the
 * garage is just late).
 */
export function customerWaitingLine(vendorName: string, deadline: ResponseDeadline | null, now: number): string {
  if (!deadline || new Date(deadline.respondBy).getTime() <= now) return `Waiting for ${vendorName} to accept`
  return `Waiting for ${vendorName} to accept — by ${formatStepTime(deadline.respondBy, now)}`
}

/**
 * The second line under it, said only with the switch on, so it is a
 * promise the server keeps: what happens if the garage does not answer, or
 * that it is happening now.
 */
export function customerWaitingNote(deadline: ResponseDeadline | null, now: number): string | null {
  if (!deadline?.enforced) return null
  return new Date(deadline.respondBy).getTime() <= now
    ? "The garage didn't accept in time, so this booking is being cancelled and your payment refunded in full."
    : "If they don't, this booking is cancelled and your payment refunded in full."
}

/** The cancelled booking's heading when the garage did not accept in time. */
export function notAcceptedTitle(vendorName: string): string {
  return `${vendorName} didn't accept in time`
}

/**
 * Its refund line: "on its way" while the refund is owed and nobody has
 * started it; once it has been started or done, the usual refund line,
 * which names the amount and the day.
 */
export function notAcceptedRefundLine(refund: BookingRefund | undefined): string | null {
  // Not with Detlio credit in it (0049): that part goes back to the credit,
  // not the bank, and the usual line says which is which.
  if (refund?.status === 'owed' && !refund.started && refund.amountRefunded === 0 && !refund.credit) {
    return `Your full refund is on its way (${BANK_DAYS}).`
  }
  return customerRefundLine(refund)
}
