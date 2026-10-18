import { formatRupees } from '@repo/core/job-records'
import type { BookingRefund } from '@repo/core/types'
import { APP_TIMEZONE } from '@repo/core/utils'

/**
 * How refunds are put into words: the line a customer reads on their booking
 * and how long ops has owed one. The rules about what is owed live on the
 * server (apps/server/src/lib/refunds.ts); these only say what it sent.
 * Pure, with the clock passed in, so the exact wording is unit-tested.
 */

/**
 * Banks take this long to show a refund, which is what the customer is
 * actually waiting for once Detlio has sent it. Said, not promised: Detlio
 * does the refund, the bank decides when it appears.
 *
 * Exported for the Cancellation & Refund Policy, which quotes it.
 */
export const BANK_DAYS = '5–7 working days'

const DATE = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: APP_TIMEZONE,
})

/** "5 Oct 2026", in Chennai. */
function formatDate(iso: string): string {
  const parts = DATE.formatToParts(new Date(iso))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  return `${part('day')} ${part('month')} ${part('year')}`
}

/**
 * What the money coming back was for. A cancelled booking gives back its
 * payment; a booking that is still on can only owe a payment that landed on a
 * final bill the garage then replaced, and saying just "your payment" there
 * reads as if the booking itself was off.
 */
export type RefundFor = 'payment' | 'earlier_bill'

/**
 * What the customer's booking page says about their money coming back, or
 * null when nothing is coming back (including a customer no-show, which the
 * server never reports as owed: the page already says that payment isn't
 * refunded).
 *
 * - Started through Razorpay from the app, not finished there yet: how
 *   much, the day it started, and when it reaches the account.
 * - Owed, nothing sent yet: our team will refund it, and how long that takes.
 * - Partly sent: how much of how much, and when. Nothing about the rest: ops
 *   may have kept part on purpose, and there is no state yet that says so,
 *   so a promise about the remainder could sit there unkept for good.
 * - All sent: how much and when, and that the bank can take a while to show it.
 *
 * Gift a wash (0049): the part paid with Detlio credit goes back to the
 * customer's credit, never their card, so it gets a sentence of its own
 * ("₹300 back in your Detlio credit."), and everything said about the card,
 * bank days included, is about the rest only. A booking paid wholly with
 * credit gets the credit sentence alone: no bank refund is promised.
 */
export function customerRefundLine(
  refund: BookingRefund | undefined,
  what: RefundFor = 'payment'
): string | null {
  if (!refund || refund.status === 'none') return null

  const credit = refund.credit && refund.credit.amount > 0 ? refund.credit : null
  if (!credit) return moneyRefundLine(refund, what, false)

  const creditLine = credit.returnedAt
    ? `${formatRupees(credit.amount)} back in your Detlio credit.`
    : `${formatRupees(credit.amount)} going back to your Detlio credit.`

  // `amount` and, once it is back, `amountRefunded` count the credit too.
  const moneyAmount = toRupees(toPaise(refund.amount) - toPaise(credit.amount))
  if (moneyAmount <= 0) return creditLine
  const moneyRefunded = Math.max(
    0,
    toRupees(toPaise(refund.amountRefunded) - (credit.returnedAt ? toPaise(credit.amount) : 0))
  )
  // `refundedAt` is the latest of the two parts. When it is the credit's
  // own time, the card refund's day isn't known, so none is named.
  const refundedAt =
    refund.refundedAt && refund.refundedAt !== credit.returnedAt ? refund.refundedAt : undefined
  const money: BookingRefund = {
    status: moneyRefunded >= moneyAmount ? 'refunded' : 'owed',
    amount: moneyAmount,
    amountRefunded: moneyRefunded,
    refundedAt,
    started: refund.started,
  }
  return `${moneyRefundLine(money, what, true)} ${creditLine}`
}

function toPaise(rupees: number): number {
  return Math.round(rupees * 100)
}

function toRupees(paise: number): number {
  return paise / 100
}

/**
 * The card (Razorpay) part's line. `partOnline` is set when some of the
 * booking was paid with credit, so "your payment" would be too much: the
 * owed line names the amount paid online instead.
 */
function moneyRefundLine(refund: BookingRefund, what: RefundFor, partOnline: boolean): string {
  const when = refund.refundedAt ? ` on ${formatDate(refund.refundedAt)}` : ''
  const forBill = what === 'earlier_bill' ? ' for the earlier final bill' : ''
  const showing = `It can take ${BANK_DAYS} to show in your account.`

  // Sent through Razorpay from the app and still on its way: said as
  // started, with the day it was, until Razorpay finishes it.
  if (refund.started && refund.started.amount > 0) {
    return `Refund of ${formatRupees(refund.started.amount)}${forBill} started on ${formatDate(refund.started.at)}. It reaches your account in ${BANK_DAYS}.`
  }

  if (refund.status === 'refunded') {
    return `Refunded ${formatRupees(refund.amountRefunded)}${forBill}${when}. ${showing}`
  }

  if (refund.amountRefunded > 0) {
    return `Refunded ${formatRupees(refund.amountRefunded)} of ${formatRupees(refund.amount)}${forBill}${when}. ${showing}`
  }

  const yours =
    what === 'earlier_bill'
      ? `your ${formatRupees(refund.amount)} payment for the earlier final bill`
      : partOnline
        ? `the ${formatRupees(refund.amount)} you paid online`
        : 'your payment'
  return `Our team will refund ${yours} to your original payment method within ${BANK_DAYS}.`
}

/**
 * Some cancellation reasons were written with the refund promised in them:
 * a payment that landed after the garage filled up (settlePayment's refusal)
 * is stored as "…could not be confirmed. Your payment will be refunded." The
 * refund line says that properly, and once the refund is recorded the old
 * sentence would contradict it, so the page drops it whenever a refund line
 * is shown. Only that exact closing sentence goes; the rest is kept.
 */
const REFUND_PROMISE = /\s*Your payment will be refunded\.\s*$/

export function withoutRefundPromise(reason: string | null | undefined): string | null {
  if (!reason) return null
  return reason.replace(REFUND_PROMISE, '').trim() || null
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/**
 * After this long a refund owed is late: amber on the Refunds page. Two days
 * leaves a weekend's slack inside the 5–7 working days the customer was told.
 */
export const REFUND_LATE_AFTER_DAYS = 2

/**
 * How long a refund has been owed, for the Refunds page: "owed 3 h",
 * "owed 1 day", "owed 4 days", and whether that is late. Null `since` (a row
 * with no recorded time) reads as just "owed".
 */
export function refundOwedAge(
  since: string | null,
  now: number
): { label: string; late: boolean } {
  if (!since) return { label: 'owed', late: false }
  const elapsed = Math.max(0, now - Date.parse(since))
  const days = Math.floor(elapsed / DAY_MS)
  const late = elapsed >= REFUND_LATE_AFTER_DAYS * DAY_MS

  if (days === 0) {
    const hours = Math.floor(elapsed / HOUR_MS)
    return { label: hours === 0 ? 'owed under an hour' : `owed ${hours} h`, late }
  }
  return { label: `owed ${days} ${days === 1 ? 'day' : 'days'}`, late }
}
