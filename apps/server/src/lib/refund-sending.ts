/**
 * Sending refunds through Razorpay from the app, as pure rules: what is
 * already on Razorpay that we have no record of, how much to send, and which
 * refunds the automatic mode may send without anyone pressing anything.
 *
 * What is owed at all is lib/refunds.ts, and nothing here restates it. The
 * owner's rules for the app sending money, in short:
 *
 *   - Never twice, never more than was paid. Before sending, the payment's
 *     refunds are read from Razorpay and any we have no record of are
 *     recorded first (a refund done by hand in the dashboard is recorded,
 *     not repeated); then only what is still owed may go.
 *   - Always at normal speed. Instant refunds cost extra.
 *   - The automatic mode (AUTO_REFUNDS=on, off by default) only takes the
 *     clear-cut cases: the garage declined or didn't turn up, the customer
 *     cancelled (the cancel route only allows it within the allowed time),
 *     Detlio cancelled, or a checkout's payment was captured and became no
 *     booking. Never a final-bill payment, never a part amount, never a
 *     booking with a complaint that is open or acknowledged: those wait for
 *     a person and the Refund now button. A daily cap
 *     (AUTO_REFUND_DAILY_CAP_INR) stops it for the rest of the day.
 *
 * Clock-free: the caller passes `now`. Node's crypto is used for the
 * idempotency key, and nothing else outside this file and lib/refunds.ts.
 */
import { createHash } from 'node:crypto'
import {
  checkRefund,
  paiseOf,
  rupeesOf,
  type RefundCheck,
  type RefundKind,
  type RefundSource,
} from './refunds.js'

// ─── What Razorpay already has ───────────────────────────────────────────────

/** A refund of the payment, as GET /payments/:id/refunds lists it. */
export interface GatewayRefund {
  id: string
  amountPaise: number
  /** 'pending', 'processed' or 'failed'. */
  status: string
  notes: Record<string, string>
}

/**
 * Razorpay's refunds of a payment that no refund record holds yet: done by
 * hand in the dashboard and never marked, or sent by us with the answer lost
 * on the way back. A failed one moved no money and is left out.
 */
export function unrecordedGatewayRefunds(
  gateway: readonly GatewayRefund[],
  recordedRefs: ReadonlySet<string>
): GatewayRefund[] {
  return gateway.filter((refund) => refund.status !== 'failed' && !recordedRefs.has(refund.id))
}

/**
 * The source a refund found on Razorpay is recorded with. Ours, when its
 * notes say the app sent it for this very money (see razorpayRefundNotes);
 * anything else was done in the dashboard.
 */
export function sourceOfFoundRefund(
  refund: Pick<GatewayRefund, 'notes'>,
  target: { kind: RefundKind; id: string }
): Exclude<RefundSource, 'recorded'> {
  const notes = refund.notes ?? {}
  const ours =
    (notes.detlio_source === 'admin' || notes.detlio_source === 'auto') &&
    notes.detlio_kind === target.kind &&
    notes.detlio_id === target.id
  return ours ? (notes.detlio_source as 'admin' | 'auto') : 'razorpay'
}

/**
 * The notes a refund carries on Razorpay (at most 15 of 256 characters
 * there): the money it is for, under the same names our orders use
 * (booking_id, intent_id, charge_id), and who sent it. They are how a refund
 * found on Razorpay later is known to be ours.
 */
export function razorpayRefundNotes(input: {
  kind: RefundKind
  id: string
  bookingId: string | null
  source: 'admin' | 'auto'
}): Record<string, string> {
  return {
    detlio_kind: input.kind,
    detlio_id: input.id,
    detlio_source: input.source,
    ...(input.kind === 'checkout' && { intent_id: input.id }),
    ...(input.kind === 'bill' && { charge_id: input.id }),
    ...(input.bookingId && { booking_id: input.bookingId }),
  }
}

// ─── How much to send ────────────────────────────────────────────────────────

/**
 * What a send comes to before anything moves: send `amount` (in rupees), or
 * one of checkRefund's refusals, or `no_payment` when there is no Razorpay
 * payment to refund (only Mark refunded can record that money).
 */
export type SendDecision =
  | { kind: 'send'; amount: string }
  | { kind: Exclude<RefundCheck, 'ok'> }
  | { kind: 'no_payment' }

/**
 * How much to send: what was asked for (a part amount from the button), or
 * else everything still owed, and never more than that. Worked from the
 * figures read after Razorpay's own refunds were recorded.
 */
export function refundToSend(input: {
  refundable: boolean
  paid: string
  refunded: string | null | undefined
  paymentId: string | null
  requested?: string | number
}): SendDecision {
  const owed = Math.max(0, paiseOf(input.paid) - paiseOf(input.refunded))
  const amount = input.requested === undefined ? rupeesOf(owed) : input.requested
  const check = checkRefund({
    refundable: input.refundable,
    paid: input.paid,
    refunded: input.refunded,
    amount,
  })
  if (check !== 'ok') return { kind: check }
  if (!input.paymentId) return { kind: 'no_payment' }
  return { kind: 'send', amount: rupeesOf(paiseOf(amount)) }
}

// ─── The automatic mode ──────────────────────────────────────────────────────

/** Why money is owed, among the cases the automatic mode takes. */
export type AutoRefundCause =
  | 'garage_declined'
  | 'garage_no_show'
  | 'customer_cancelled'
  | 'detlio_cancelled'
  | 'paid_no_booking'
  /** Detlio approved a refund instead of a free redo (0051): Detlio's own decision. */
  | 'guarantee_refund'

/**
 * The clear-cut reason a cancelled booking's payment is owed, or null when
 * it is not one of them. A customer no-show keeps the payment and a moved
 * booking's payment went with it (lib/refunds.ts), so neither has a cause;
 * nor does a booking cancelled with nobody recorded as cancelling it.
 *
 * A customer's cancel counts as "in the allowed time" because the cancel
 * route refuses one past the cutoff (CANCELLATION_WINDOW_PASSED).
 */
export function autoRefundCause(booking: {
  status: string
  noShow: 'customer' | 'garage' | null
  cancelledBy: 'user' | 'vendor' | 'admin' | null
  moved: boolean
  /** A refund instead of a redo on a completed booking (0051). */
  guaranteeRefund?: boolean
}): AutoRefundCause | null {
  // Detlio decided it, with a typed name, after looking at both sides'
  // photos: as clear-cut as a cancellation Detlio made.
  if (booking.guaranteeRefund && booking.status === 'completed') return 'guarantee_refund'
  if (booking.status !== 'cancelled' || booking.moved) return null
  if (booking.noShow === 'customer') return null
  if (booking.noShow === 'garage') return 'garage_no_show'
  switch (booking.cancelledBy) {
    case 'vendor':
      return 'garage_declined'
    case 'user':
      return 'customer_cancelled'
    case 'admin':
      return 'detlio_cancelled'
    default:
      return null
  }
}

/**
 * Why the automatic mode leaves a refund for a person, or for later:
 *
 * - `bill`: final-bill money is never refunded automatically.
 * - `not_owed`: nothing is left to give back.
 * - `part_refunded`: some of it has gone back already. A part refund was a
 *   person's decision, so the rest is theirs too; the automatic mode only
 *   ever sends a whole payment.
 * - `not_clear_cut`: not one of the cases it takes (autoRefundCause).
 * - `no_payment_id`: no Razorpay payment to refund.
 * - `complaint`: the booking has a complaint that is open or acknowledged.
 * - `too_old`: owed for longer than AUTO_REFUND_LOOKBACK_MS. Switching the
 *   mode on must not refund an old backlog someone may already have paid
 *   back outside Razorpay without recording it.
 * - `gave_up`: tried AUTO_REFUND_MAX_ATTEMPTS times, and failed each time.
 * - `daily_cap`: the day's cap is reached (decided by the caller, which
 *   reads the day's figures; see autoRefundFitsCap).
 */
export type AutoRefundHold =
  | 'bill'
  | 'not_owed'
  | 'part_refunded'
  | 'not_clear_cut'
  | 'no_payment_id'
  | 'complaint'
  | 'too_old'
  | 'gave_up'
  | 'daily_cap'

/** Failed tries after which the automatic mode leaves a refund to a person. */
export const AUTO_REFUND_MAX_ATTEMPTS = 3

/** How long after money became owed the automatic mode still takes it. */
export const AUTO_REFUND_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000

/** The most automatic refunds one cron run tries. */
export const AUTO_REFUND_SWEEP_LIMIT = 20

/** The default daily cap, in rupees, when AUTO_REFUND_DAILY_CAP_INR is unset. */
export const AUTO_REFUND_DEFAULT_DAILY_CAP_INR = 20_000

export function autoRefundHold(input: {
  kind: RefundKind
  owed: string
  refunded: string | null | undefined
  paymentId: string | null
  /** autoRefundCause for a booking; 'paid_no_booking' for a checkout. */
  cause: AutoRefundCause | null
  complaintOpen: boolean
  failedAttempts: number
  since: Date | null
  now: Date
}): AutoRefundHold | null {
  if (input.kind === 'bill') return 'bill'
  if (paiseOf(input.owed) <= 0) return 'not_owed'
  if (paiseOf(input.refunded) > 0) return 'part_refunded'
  if (!input.cause) return 'not_clear_cut'
  if (!input.paymentId) return 'no_payment_id'
  if (input.complaintOpen) return 'complaint'
  if (!input.since || input.now.getTime() - input.since.getTime() > AUTO_REFUND_LOOKBACK_MS) return 'too_old'
  if (input.failedAttempts >= AUTO_REFUND_MAX_ATTEMPTS) return 'gave_up'
  return null
}

/**
 * Whether one more automatic refund of `amount` stays within the day's cap,
 * given what has gone out automatically today. The cap is inclusive: a day
 * may send exactly the cap. A cap of 0 sends nothing.
 */
export function autoRefundFitsCap(input: { sentToday: string; amount: string; cap: number }): boolean {
  return paiseOf(input.sentToday) + paiseOf(input.amount) <= paiseOf(input.cap)
}

/**
 * AUTO_REFUND_DAILY_CAP_INR as rupees: unset, negative or not a number is
 * the default; never above ₹1 crore, the most a refund figure holds
 * (numeric(10, 2)).
 */
export function parseDailyCap(raw: string | undefined): number {
  const trimmed = raw?.trim()
  if (!trimmed) return AUTO_REFUND_DEFAULT_DAILY_CAP_INR
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) return AUTO_REFUND_DEFAULT_DAILY_CAP_INR
  return Math.min(value, 10_000_000)
}

// ─── The request ─────────────────────────────────────────────────────────────

/**
 * The idempotency key a refund is sent under (Razorpay's
 * X-Refund-Idempotency: at least 10 of letters, digits, _ and -). The same
 * attempt at the same refund always gets the same key, so a retry after a
 * lost answer is answered with the refund Razorpay already made instead of
 * a second one. Razorpay refuses a key reused with a different body, so the
 * key covers everything the body says: the money, the running total it was
 * sent against, the amount and who sent it. `attempt` (the failed tries so
 * far) moves on after a failure, so the retry is a new request.
 */
export function refundIdempotencyKey(input: {
  kind: RefundKind
  targetId: string
  refundedBefore: string
  attempt: number
  amount: string
  source: 'admin' | 'auto'
}): string {
  const parts = [
    input.kind,
    input.targetId,
    paiseOf(input.refundedBefore),
    input.attempt,
    paiseOf(input.amount),
    input.source,
  ].join(':')
  return `dtl_${createHash('sha256').update(parts).digest('hex').slice(0, 40)}`
}

/**
 * Whether Razorpay's refusal of a refund means nothing was made: a client
 * error. A timeout, a 5xx, a 409 (the same key still being worked on) or a
 * 429 leaves it unknown, and the refund may yet exist.
 */
export function refusalIsDefinite(status: number | null): boolean {
  if (status === null) return false
  return status >= 400 && status < 500 && status !== 408 && status !== 409 && status !== 429
}

// ─── The figures and the words ───────────────────────────────────────────────

/**
 * The running total after a refund failed: that refund taken back off,
 * never below zero, and null (as an untouched row reads) when nothing is
 * left refunded.
 */
export function afterFailedRefund(
  refundedSoFar: string | null | undefined,
  amount: string
): { refundedAmount: string | null } {
  const left = Math.max(0, paiseOf(refundedSoFar) - paiseOf(amount))
  return { refundedAmount: left === 0 ? null : rupeesOf(left) }
}

/** Who a refund the automatic mode sent is signed by, like its booking notes. */
export const AUTO_REFUND_BY = 'Detlio (automatic)'

/** Who a refund found on Razorpay is recorded by. */
export const FOUND_REFUND_BY = 'Detlio (found in Razorpay)'

/**
 * What `refund_note` says on money the app sent through Razorpay: the
 * marker that it went from the app, then anything ops wrote.
 */
export function appRefundNote(source: 'admin' | 'auto', by: string, note?: string | null): string {
  const head =
    source === 'auto'
      ? 'Sent through Razorpay automatically.'
      : `Sent through Razorpay from the app by ${by}.`
  const extra = note?.trim()
  return extra ? `${head}\n${extra}` : head
}

/** A reason for the team, at most 300 characters, never empty. */
export function failureReasonFor(description: string | null | undefined, fallback: string): string {
  const text = description?.replace(/\s+/g, ' ').trim() || fallback
  return text.length > 300 ? `${text.slice(0, 299)}…` : text
}
