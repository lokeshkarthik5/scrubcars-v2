/**
 * The final bill of an inspection job, as pure rules.
 *
 * How it works, in the owner's words: like Swiggy Dineout. The customer
 * prepays the inspection fee at checkout. The garage looks at the car, does
 * the work, and raises the final bill in its portal. If the bill is more than
 * what was paid, the customer sees it in the app — total, already paid,
 * balance — and pays the balance there. If it is not more, nothing is due and
 * nothing is refunded: the inspection fee is the minimum.
 *
 * Money is carried as decimal strings and added in paise, like the rest of
 * the API (see sumAmounts in pricing.ts). Clock-free: the caller passes `now`.
 */

/** A bill longer than this is a quote that belongs in a phone call. */
export const FINAL_BILL_MAX_LINES = 20

/** One line is a short name for a part or a job ("Rear bumper respray"). */
export const FINAL_BILL_LINE_MAX_CHARS = 80

/**
 * How long after completion a bill can still be raised. Long enough for a
 * garage that finishes late to send it the next morning; short enough that a
 * customer is not surprised by a bill for a job they collected last week.
 */
export const FINAL_BILL_WINDOW_DAYS = 3

const DAY_MS = 24 * 60 * 60 * 1000

function toPaise(amount: string | number): number {
  return Math.round(Number(amount) * 100)
}

function fromPaise(paise: number): string {
  return (paise / 100).toFixed(2)
}

/** The bill's total: its lines, added in paise. */
export function finalBillTotal(lines: Array<{ amount: string | number }>): string {
  return fromPaise(lines.reduce((total, line) => total + toPaise(line.amount), 0))
}

/**
 * What is left for the customer to pay: the total less what the booking
 * already covers (creditAtBooking), never below zero. Nothing is refunded
 * when the work comes to less than the inspection fee.
 */
export function finalBillAmountDue(total: string, paidBefore: string): string {
  return fromPaise(Math.max(0, toPaise(total) - toPaise(paidBefore)))
}

/** 'due' when there is a balance to pay, 'not_needed' when there is none. */
export function finalBillStatus(amountDue: string): 'due' | 'not_needed' {
  return toPaise(amountDue) > 0 ? 'due' : 'not_needed'
}

/**
 * What the booking already covers toward the final bill: its pre-discount
 * price, once the payment for it has landed, otherwise nothing.
 *
 * The price, not the cash. A customer who used a promo code at checkout was
 * promised that saving, and taking the bill's balance off the cash they paid
 * would quietly charge the discount back to them. It also keeps the garage's
 * side straight: what it is paid for the booking (computeVendorPayout) plus
 * the bill's balance comes to the bill it wrote, never more.
 *
 * The whole booking counts, flat-priced services included: the garage's form
 * starts the bill from the booking's services, so the bill covers the whole
 * job and nothing is credited that the bill does not list.
 *
 * A job cannot be accepted unpaid, so in practice the payment has always
 * landed; the rule is here so a bill never counts money that did not arrive.
 */
export function creditAtBooking(booking: {
  amount: string
  subtotalAmount?: string | null
  payment?: { status: string } | null
}): string {
  if (!booking.payment || !['paid', 'collected'].includes(booking.payment.status)) return '0.00'
  return fromPaise(toPaise(booking.subtotalAmount ?? booking.amount))
}

/** Why a final bill cannot be raised on a booking right now. */
export type FinalBillRefusal =
  /** None of the booking's services is priced on inspection. */
  | 'not_inspection'
  /** The garage has not started the job, so nothing has been inspected. */
  | 'not_started'
  /** Cancelled or moved: there is no job to bill. */
  | 'booking_closed'
  /** Completed more than three days ago. */
  | 'window_closed'

/**
 * Whether the garage can raise (or replace) a final bill on a booking now.
 *
 * `pricingTypes` are the pricing types of the booking's services. Only a
 * booking with at least one on_inspection service was sold with "final work
 * quoted after inspection"; a flat-priced job has no bill to add to.
 * `completedAt` is null on jobs finished before completion times were
 * recorded, and the scheduled time stands in, which closes the window sooner.
 */
export function finalBillRefusal(input: {
  status: string
  pricingTypes: string[]
  completedAt: Date | null
  scheduledAt: Date
  now: number
}): FinalBillRefusal | null {
  if (!input.pricingTypes.includes('on_inspection')) return 'not_inspection'
  if (input.status === 'pending' || input.status === 'confirmed') return 'not_started'
  if (input.status !== 'in_progress' && input.status !== 'completed') return 'booking_closed'

  if (input.status === 'completed') {
    const finished = (input.completedAt ?? input.scheduledAt).getTime()
    if (input.now - finished > FINAL_BILL_WINDOW_DAYS * DAY_MS) return 'window_closed'
  }

  return null
}

/** The facts about a bill that decide what a captured payment does to it. */
export interface ChargeForSettlement {
  status: 'due' | 'paid' | 'cancelled' | 'not_needed'
  amountDue: string
  gatewayOrderId: string | null
  gatewayPaymentId: string | null
}

/**
 * What to do with a captured Razorpay payment for a bill. The browser's
 * verify call and the webhook both arrive for the same payment, in either
 * order, so every answer here must be safe to reach twice.
 *
 * - `settle`: the bill is due and this is its order — mark it paid (with a
 *   write conditional on it still being due).
 * - `already_paid`: this same payment settled it before. Answer success.
 * - `paid_twice`: the bill was settled by a different payment. Money taken
 *   twice — refund due.
 * - `replaced`: the garage replaced the bill while the customer was paying.
 *   Money taken for a bill that no longer stands — refund due.
 * - `order_mismatch`: the payment is not for this bill's order.
 * - `amount_mismatch`: the amount captured is not the amount due.
 * - `not_due`: the bill had nothing to pay. No order is ever opened for one,
 *   so this only happens if something upstream is wrong.
 *
 * `amountPaise` is what Razorpay says it captured. The webhook knows it; the
 * browser's verify call does not, and relies on the order (opened for exactly
 * the amount due on a bill whose amount never changes) instead.
 */
export type ChargeSettlement =
  | 'settle'
  | 'already_paid'
  | 'paid_twice'
  | 'replaced'
  | 'order_mismatch'
  | 'amount_mismatch'
  | 'not_due'

export function chargeSettlement(
  charge: ChargeForSettlement,
  payment: { orderId: string | null | undefined; paymentId: string; amountPaise?: number }
): ChargeSettlement {
  if (charge.status === 'paid') {
    return charge.gatewayPaymentId === payment.paymentId ? 'already_paid' : 'paid_twice'
  }
  if (!charge.gatewayOrderId || payment.orderId !== charge.gatewayOrderId) {
    return 'order_mismatch'
  }
  if (payment.amountPaise !== undefined && payment.amountPaise !== toPaise(charge.amountDue)) {
    return 'amount_mismatch'
  }
  if (charge.status === 'cancelled') return 'replaced'
  if (charge.status === 'not_needed') return 'not_due'
  return 'settle'
}

/** A bill row as the repository returns it. */
export interface FinalBillRecord {
  id: string
  kind: 'final_bill'
  status: 'due' | 'paid' | 'cancelled' | 'not_needed'
  totalAmount: string
  paidBefore: string
  amountDue: string
  lines: Array<{ description: string; amount: string }>
  note: string | null
  gatewayOrderId: string | null
  gatewayPaymentId: string | null
  paidAt: Date | null
  createdAt: Date
  updatedAt: Date
  /** Money given back on this bill, once ops records it (0029). */
  refundedAmount?: string | null
  refundedAt?: Date | null
}

/**
 * The bill that stands: the newest one the garage has not replaced. At most
 * one exists (a partial unique index holds it); the rest are history.
 */
export function liveFinalBill<T extends Pick<FinalBillRecord, 'kind' | 'status'>>(
  charges: T[] | null | undefined
): T | null {
  return charges?.find((c) => c.kind === 'final_bill' && c.status !== 'cancelled') ?? null
}

/**
 * A bill as the customer and the garage see it. The Razorpay ids are left
 * out: they are for the team reconciling payments, and only admin gets them.
 */
export function toFinalBillView(bill: FinalBillRecord) {
  return {
    id: bill.id,
    status: bill.status,
    lines: bill.lines.map((line) => ({ description: line.description, amount: line.amount })),
    totalAmount: bill.totalAmount,
    paidBefore: bill.paidBefore,
    amountDue: bill.amountDue,
    note: bill.note,
    paidAt: bill.paidAt?.toISOString() ?? null,
    createdAt: bill.createdAt.toISOString(),
  }
}

/**
 * What a booking's paid bills add up to: money the garage is owed on top of
 * its payout for the booking itself.
 */
export function paidChargesTotal(
  charges: Array<{ status: string; amountDue: string }> | null | undefined
): string {
  return fromPaise(
    (charges ?? [])
      .filter((c) => c.status === 'paid')
      .reduce((total, c) => total + toPaise(c.amountDue), 0)
  )
}
