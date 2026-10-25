/**
 * Refunds, as pure rules: what Detlio owes back, how much of it is left, and
 * what recording a refund does to the figures.
 *
 * The owner's decisions, in short:
 *
 *   - Ops can refund from the app: "Refund now" in admin sends it through
 *     Razorpay. A refund done by hand in the Razorpay dashboard is still
 *     recorded here (Mark refunded: the refund id, the amount, who), so "who
 *     still needs refunding?" has an answer either way.
 *   - With AUTO_REFUNDS=on (off by default) the clear-cut cases go back with
 *     nobody pressing anything; which ones, and what always waits for a
 *     person, is lib/refund-sending.ts.
 *   - When a paid booking is cancelled — by the customer in time, by the
 *     garage, or by Detlio — or the garage doesn't turn up, the customer gets
 *     their money back. A customer who doesn't turn up does not: the garage
 *     held the slot, and that is the published no-show policy.
 *   - A checkout whose payment was captured but became no booking (a failed
 *     booking intent) is refunded, and so is money paid on a final bill that
 *     no longer stands.
 *
 * Money is carried as decimal strings and worked in paise, like the rest of
 * the API (see final-bill.ts). Clock-free: nothing here reads the time.
 */

/** Where the money to give back was taken. */
export type RefundKind = 'booking' | 'checkout' | 'bill'

/**
 * Where a refund stands: something still to give back, all of it given back,
 * or nothing to give back at all.
 */
export type RefundState = 'owed' | 'refunded' | 'none'

/**
 * How a refund came to be recorded (refund_records.source, 0036): by ops
 * after doing it by hand ('recorded', Mark refunded), found on the payment
 * in Razorpay with no record here ('razorpay': done in the dashboard and
 * never marked), or sent through Razorpay by the app itself, from the
 * Refund now button ('admin') or the automatic mode ('auto').
 */
export type RefundSource = 'recorded' | 'razorpay' | 'admin' | 'auto'

/** Where Razorpay says a refund stands. Only these three exist. */
export type GatewayRefundStatus = 'pending' | 'processed' | 'failed'

/** The refunds the app sent itself, as opposed to ones recorded after the fact. */
export function sentFromApp(source: RefundSource): boolean {
  return source === 'admin' || source === 'auto'
}

function toPaise(amount: string | number | null | undefined): number {
  const value = Number(amount ?? 0)
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}

function fromPaise(paise: number): string {
  return (paise / 100).toFixed(2)
}

/** A decimal amount in paise, the way every rule here works it. */
export function paiseOf(amount: string | number | null | undefined): number {
  return toPaise(amount)
}

/** Paise back to the decimal string the API carries. */
export function rupeesOf(paise: number): string {
  return fromPaise(paise)
}

/** What is still to give back: paid less refunded so far, never below zero. */
export function amountOwed(paid: string, refunded: string | null | undefined): string {
  return fromPaise(Math.max(0, toPaise(paid) - toPaise(refunded)))
}

// ─── What is owed ────────────────────────────────────────────────────────────

/** A booking, with what decides whether its money goes back. */
export interface BookingForRefund {
  status: string
  noShow: 'customer' | 'garage' | null
  /**
   * The customer moved it to a new time. A reschedule cancels the old row
   * and copies its payment, still 'paid', onto the new one: the money went
   * with the move, so the old row owes nothing.
   */
  moved: boolean
}

/** A booking's own payment, as the payments row holds it. */
export interface PaymentForRefund {
  status: string
  /** What came through Razorpay: the only money these rules give back as money. */
  amount: string
  refundedAmount?: string | null
  /**
   * The part paid with Detlio credit (0049). Never refunded as money: it goes
   * back to the customer's credit (modules/gift-credit) when the payment is
   * refundable, and `creditReturnedAt` says when it did. Only what the
   * customer is told adds it in (customerRefund).
   */
  creditAmount?: string | null
  creditReturnedAt?: Date | string | null
}

/**
 * Whether a booking's own payment is money to give back, refunded yet or
 * not: the booking is off (cancelled by anyone, or a garage no-show), the
 * money arrived, and neither of the two exceptions applies — a customer
 * no-show keeps the payment, and a moved booking's payment went with it.
 *
 * 'refunded' counts as well as 'paid': a refunded payment was refundable,
 * which is how it shows on the done list.
 */
export function isBookingPaymentRefundable(
  booking: BookingForRefund,
  payment: Pick<PaymentForRefund, 'status'> | null | undefined
): boolean {
  if (!payment || (payment.status !== 'paid' && payment.status !== 'refunded')) return false
  if (booking.status !== 'cancelled') return false
  if (booking.moved) return false
  return booking.noShow !== 'customer'
}

/** What is still owed on a booking's own payment. '0.00' when nothing is. */
export function bookingPaymentOwed(
  booking: BookingForRefund,
  payment: PaymentForRefund | null | undefined
): string {
  if (!payment || !isBookingPaymentRefundable(booking, payment)) return '0.00'
  if (payment.status === 'refunded') return '0.00'
  return amountOwed(payment.amount, payment.refundedAmount)
}

/** A checkout (booking intent), as the row holds it. */
export interface CheckoutForRefund {
  status: string
  /** The captured Razorpay payment, set only when the checkout failed. */
  paymentRef: string | null
  amount: string
  refundedAmount?: string | null
}

/**
 * A failed checkout with a payment on it: money captured, no booking. A
 * checkout that never got a payment has nothing to give back.
 */
export function isCheckoutRefundable(checkout: Pick<CheckoutForRefund, 'status' | 'paymentRef'>): boolean {
  return checkout.status === 'failed' && Boolean(checkout.paymentRef)
}

export function checkoutOwed(checkout: CheckoutForRefund): string {
  if (!isCheckoutRefundable(checkout)) return '0.00'
  return amountOwed(checkout.amount, checkout.refundedAmount)
}

/**
 * A booking charge — a final bill or extra work (0041) — as the
 * booking_charges row holds it. `kind` is absent on callers from before extra
 * work existed, which only ever read final bills.
 */
export interface BillForRefund {
  kind?: string
  status: string
  gatewayPaymentId: string | null
  amountDue: string
  refundedAmount?: string | null
}

/**
 * A payment that landed on a bill that no longer stood: the garage had
 * replaced it, or ops had cancelled the booking and so withdrawn it. The
 * bill stays cancelled with the payment id on it (see
 * recordPaymentOnReplacedBill), which is how it is found. Always given back,
 * whatever happened to the booking: it paid for nothing.
 */
export function isStrayBillPayment(bill: Pick<BillForRefund, 'status' | 'gatewayPaymentId'>): boolean {
  return bill.status === 'cancelled' && Boolean(bill.gatewayPaymentId)
}

/**
 * Whether money paid on a bill goes back: a stray payment always does, and
 * a paid bill does when its booking was then cancelled — unless that
 * cancellation was a customer no-show, where the customer's money stays.
 *
 * Paid extra work (0041) is kept only when its booking completes: on a
 * booking that ends any other way — cancelled by anyone, moved to a new
 * time, or a no-show on either side — the work was not delivered, so it goes
 * back, a customer no-show included (lib/extra-work.ts).
 *
 * A second payment on an already-paid bill is not here: it is recorded only
 * as a booking note, with nothing on a row to find it by.
 */
export function isBillRefundable(
  bill: Pick<BillForRefund, 'kind' | 'status' | 'gatewayPaymentId'>,
  booking: Pick<BookingForRefund, 'status' | 'noShow'>
): boolean {
  if (isStrayBillPayment(bill)) return true
  if (bill.status !== 'paid' || booking.status !== 'cancelled') return false
  if (bill.kind === 'extra_work') return true
  return booking.noShow !== 'customer'
}

export function billOwed(
  bill: BillForRefund,
  booking: Pick<BookingForRefund, 'status' | 'noShow'>
): string {
  if (!isBillRefundable(bill, booking)) return '0.00'
  return amountOwed(bill.amountDue, bill.refundedAmount)
}

/** Where a refund stands, from what is owed and what was refunded so far. */
export function refundState(owed: string, refunded: string | null | undefined): RefundState {
  if (toPaise(owed) > 0) return 'owed'
  if (toPaise(refunded) > 0) return 'refunded'
  return 'none'
}

// ─── Recording a refund ──────────────────────────────────────────────────────

/**
 * What recording `amount` would do, before anything is written.
 *
 * - `ok`: it fits in what is still owed.
 * - `not_due`: this money is not to be given back (a customer no-show, a
 *   booking still on, a checkout that took no payment).
 * - `already_refunded`: all of it has been given back already.
 * - `too_much`: more than is still owed, or not a positive amount.
 */
export type RefundCheck = 'ok' | 'not_due' | 'already_refunded' | 'too_much'

export function checkRefund(input: {
  refundable: boolean
  paid: string
  refunded: string | null | undefined
  amount: string | number
}): RefundCheck {
  if (!input.refundable) return 'not_due'
  const owed = toPaise(amountOwed(input.paid, input.refunded))
  if (owed === 0) return 'already_refunded'
  const amount = toPaise(input.amount)
  if (amount <= 0 || amount > owed) return 'too_much'
  return 'ok'
}

/**
 * The running total a refund write is made conditional on. The dialog sends
 * what had been refunded when ops opened it; when that no longer matches
 * what is on the row, null: the figures moved (someone else recorded one, or
 * this same request already went through and its answer was lost), and the
 * refund must not be added on top. A caller that sends nothing gets the
 * total just read.
 */
export function refundBase(seen: string | number | undefined, read: string | null | undefined): string | null {
  if (seen === undefined) return fromPaise(toPaise(read))
  return toPaise(seen) === toPaise(read) ? fromPaise(toPaise(seen)) : null
}

/**
 * The figures after recording `amount`: the new running total, and whether
 * that is now everything that was paid (which moves a booking's payment to
 * 'refunded'). Partial refunds add up; each one is checked against what is
 * left (checkRefund), so the total never passes what was paid.
 */
export function afterRefund(
  paid: string,
  refundedSoFar: string | null | undefined,
  amount: string | number
): { refundedAmount: string; full: boolean } {
  const total = toPaise(refundedSoFar) + toPaise(amount)
  return { refundedAmount: fromPaise(total), full: total >= toPaise(paid) }
}

/**
 * A Razorpay refund id: "rfnd_" and letters and digits (Razorpay's are 14 of
 * them). Checked so a payment id ("pay_…") or a half-pasted value is caught
 * before it becomes the record ops reconciles against.
 */
const RAZORPAY_REFUND_ID = /^rfnd_[A-Za-z0-9]{1,59}$/

export function isRazorpayRefundId(value: string): boolean {
  return RAZORPAY_REFUND_ID.test(value)
}

/**
 * What goes in `refund_note`: how the money went back when it was not
 * through Razorpay, then anything else ops wrote. Null when there is neither.
 */
export function storedRefundNote(input: {
  outsideRazorpayNote?: string | null
  note?: string | null
}): string | null {
  const outside = input.outsideRazorpayNote?.trim()
  const note = input.note?.trim()
  const parts = [outside ? `Refunded outside Razorpay: ${outside}` : null, note || null]
  const text = parts.filter((part): part is string => Boolean(part)).join('\n')
  return text || null
}

function rupees(amount: string): string {
  const value = Number(amount)
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

/**
 * The booking note a recorded refund leaves behind, so the notes stay a
 * complete history of the money (and of every part refund, where the row
 * only keeps the latest).
 */
export function refundBookingNote(input: {
  /** What was refunded: "the booking payment", "the final bill payment". */
  what: string
  amount: string
  full: boolean
  refundRef: string | null
  outsideRazorpayNote?: string | null
  note?: string | null
  /** How it came to be recorded; 'recorded' (ops, by hand) when not said. */
  source?: RefundSource
}): string {
  const how = input.refundRef
    ? `in Razorpay (${input.refundRef})`
    : `outside Razorpay: ${input.outsideRazorpayNote?.trim() ?? ''}`
  const head = {
    recorded: `Refunded ${rupees(input.amount)} of ${input.what} ${how}.`,
    razorpay: `Found a refund of ${rupees(input.amount)} of ${input.what} ${how}, done in the Razorpay dashboard, and recorded it.`,
    admin: `Sent a refund of ${rupees(input.amount)} of ${input.what} through Razorpay from the app (${input.refundRef}).`,
    auto: `Sent a refund of ${rupees(input.amount)} of ${input.what} through Razorpay automatically (${input.refundRef}).`,
  }[input.source ?? 'recorded']
  const scope = input.full ? null : 'Part refund; the rest is still owed.'
  const extra = input.note?.trim() || null
  return [head, scope, extra].filter((line): line is string => Boolean(line)).join('\n')
}

// ─── Why, and since when ─────────────────────────────────────────────────────

const ON_BEHALF_OF = {
  customer: "Cancelled by Detlio at the customer's request",
  garage: "Cancelled by Detlio at the garage's request",
  detlio: 'Cancelled by Detlio',
} as const

/**
 * Why a booking's payment is owed, in the words the admin bookings screens
 * use for who cancelled it.
 */
export function bookingRefundReason(booking: {
  noShow: 'customer' | 'garage' | null
  cancelledBy: 'user' | 'vendor' | 'admin' | null
  cancelledOnBehalfOf: 'customer' | 'garage' | 'detlio' | null
  /** Set when the cron cancelled it because the garage did not accept in time (0042). */
  responseMissedAt?: Date | null
}): string {
  if (booking.noShow === 'garage') return 'Garage no-show'
  if (booking.noShow === 'customer') return 'Customer no-show'
  // The garage's side, like a decline, but nobody pressed anything.
  if (booking.cancelledBy === 'vendor' && booking.responseMissedAt) return 'Not accepted in time'
  switch (booking.cancelledBy) {
    case 'user':
      return 'Cancelled by the customer'
    case 'vendor':
      return 'Declined by the garage'
    case 'admin':
      return ON_BEHALF_OF[booking.cancelledOnBehalfOf ?? 'detlio']
    default:
      return 'Cancelled'
  }
}

/** Why money paid on a bill (or on extra work) is owed. */
export function billRefundReason(bill: Pick<BillForRefund, 'kind' | 'status' | 'gatewayPaymentId'>): string {
  if (bill.kind === 'extra_work') {
    return isStrayBillPayment(bill)
      ? 'Extra work paid after it was withdrawn or declined'
      : 'Extra work paid on a booking that was not completed'
  }
  return isStrayBillPayment(bill)
    ? 'Final bill paid after it was replaced or withdrawn'
    : 'Final bill paid on a booking that was then cancelled'
}

/** "the final bill payment" or "the extra work payment", for booking notes. */
export function billPaymentWhat(kind: string | null | undefined): string {
  return kind === 'extra_work' ? 'the extra work payment' : 'the final bill payment'
}

/**
 * When money became owed: the later of when it was paid and when what made
 * it owed happened. A payment can land after the cancellation (a late
 * webhook on a booking the garage could no longer take), and then it was not
 * owed before it arrived.
 */
export function owedSince(...moments: Array<Date | null | undefined>): Date | null {
  return latestOf(moments)
}

function latestOf(moments: Array<Date | null | undefined>): Date | null {
  const times = moments
    .filter((moment): moment is Date => moment instanceof Date)
    .map((moment) => moment.getTime())
  return times.length > 0 ? new Date(Math.max(...times)) : null
}

// ─── One booking's refunds ───────────────────────────────────────────────────

type Refunded = { refundedAt?: Date | null }

/** A booking with its payment and its bills, as the booking reads load it. */
export type BookingWithMoney = BookingForRefund & {
  payment?: (PaymentForRefund & Refunded) | null
  charges?: Array<BillForRefund & Refunded> | null
}

/**
 * Everything to give back on one booking, added up: its own payment and money
 * paid on its bills. `paid` is what those came to, `owed` what is still to go
 * back, `refunded` what has, and `refundedAt` the latest refund recorded.
 * What the admin bookings list flags, and what the customer is told.
 */
export function bookingRefundTotals(booking: BookingWithMoney): {
  paid: string
  owed: string
  refunded: string
  refundedAt: Date | null
} {
  const pieces: Array<{ paid: string; refunded: string | null | undefined; owed: string; refundedAt: Date | null | undefined }> = []

  const payment = booking.payment
  if (payment && isBookingPaymentRefundable(booking, payment)) {
    pieces.push({
      paid: payment.amount,
      // A payment marked refunded by hand before 0029 has no amount on it:
      // all of it went back.
      refunded: payment.status === 'refunded' ? (payment.refundedAmount ?? payment.amount) : payment.refundedAmount,
      owed: bookingPaymentOwed(booking, payment),
      refundedAt: payment.refundedAt,
    })
  }
  for (const bill of booking.charges ?? []) {
    if (!isBillRefundable(bill, booking)) continue
    pieces.push({
      paid: bill.amountDue,
      refunded: bill.refundedAmount,
      owed: billOwed(bill, booking),
      refundedAt: bill.refundedAt,
    })
  }

  const sum = (read: (piece: (typeof pieces)[number]) => string | null | undefined) =>
    fromPaise(pieces.reduce((total, piece) => total + toPaise(read(piece)), 0))

  return {
    paid: sum((piece) => piece.paid),
    owed: sum((piece) => piece.owed),
    refunded: sum((piece) => piece.refunded),
    refundedAt: latestOf(pieces.map((piece) => piece.refundedAt)),
  }
}

// ─── What the customer is told ───────────────────────────────────────────────

/**
 * A booking's refunds, as its customer sees them: whether money is owed back
 * or has been, how much in all, how much has gone back, and when the latest
 * refund was recorded. No refund ids, notes or names of who did it — those
 * are the team's.
 *
 * It covers the booking's own payment and money paid on its final bills.
 * A customer no-show reads 'none' whatever is on the rows: the customer is
 * told plainly that the payment isn't refunded, and nothing here may
 * contradict that.
 */
export interface CustomerRefund {
  status: RefundState
  /** Everything that is being or has been given back. */
  amount: string
  amountRefunded: string
  /** When the latest refund was recorded, as ISO. */
  refundedAt: string | null
  /**
   * Refunds the app sent through Razorpay that Razorpay has not finished
   * yet: how much, and when the latest was started. Left out when there are
   * none, so the payload is what it always was for every other booking.
   */
  started?: { amount: string; at: string }
  /**
   * The part of the booking paid with Detlio credit (0049), which goes back
   * to the customer's credit, not their card: how much, and when it did
   * (null while it is on its way). Left out when no credit was used. Already
   * counted in `amount` and, once back, `amountRefunded`.
   */
  credit?: { amount: string; returnedAt: string | null }
}

/** A booking's refund history row, as much as the customer's line needs. */
export interface CustomerRefundRecord {
  amount: string
  recordedAt: Date
  source: RefundSource
  gatewayStatus: GatewayRefundStatus | null
}

/**
 * The refunds the app sent through Razorpay that are still on their way:
 * sent from the app (the button or the automatic mode) and still pending at
 * Razorpay. A processed one is simply refunded, and a failed one moved no
 * money. Null when there are none.
 */
export function startedRefunds(
  records: readonly CustomerRefundRecord[]
): { amount: string; at: Date } | null {
  const pending = records.filter(
    (record) => sentFromApp(record.source) && record.gatewayStatus === 'pending'
  )
  if (pending.length === 0) return null
  const total = pending.reduce((sum, record) => sum + toPaise(record.amount), 0)
  return {
    amount: fromPaise(total),
    at: latestOf(pending.map((record) => record.recordedAt)) ?? pending[0]!.recordedAt,
  }
}

export function customerRefund(
  booking: BookingWithMoney,
  records: readonly CustomerRefundRecord[] = []
): CustomerRefund {
  // A customer no-show keeps the booking's payment and its final bill; only
  // paid extra work, which was never done, still goes back (isBillRefundable).
  const owesExtraWork = (booking.charges ?? []).some(
    (charge) => charge.kind === 'extra_work' && isBillRefundable(charge, booking)
  )
  if (booking.noShow === 'customer' && !owesExtraWork) {
    return { status: 'none', amount: '0.00', amountRefunded: '0.00', refundedAt: null }
  }
  const totals = bookingRefundTotals(booking)
  // The credit part (0049): owed back as credit until it has gone back.
  const payment = booking.payment
  const creditPaise =
    payment && isBookingPaymentRefundable(booking, payment) ? toPaise(payment.creditAmount) : 0
  const creditBack = creditPaise > 0 && Boolean(payment?.creditReturnedAt)
  const paid = toPaise(totals.paid) + creditPaise
  const owed = toPaise(totals.owed) + (creditBack ? 0 : creditPaise)
  const refunded = toPaise(totals.refunded) + (creditBack ? creditPaise : 0)
  const status = refundState(fromPaise(owed), fromPaise(refunded))
  const started = status === 'none' ? null : startedRefunds(records)
  const creditReturnedAt = creditBack ? new Date(payment!.creditReturnedAt!) : null
  const refundedAt = latestOf([totals.refundedAt, creditReturnedAt])
  return {
    status,
    amount: status === 'none' ? '0.00' : fromPaise(paid),
    amountRefunded: fromPaise(refunded),
    refundedAt: refundedAt?.toISOString() ?? null,
    ...(started && { started: { amount: started.amount, at: started.at.toISOString() } }),
    ...(creditPaise > 0 && {
      credit: { amount: fromPaise(creditPaise), returnedAt: creditReturnedAt?.toISOString() ?? null },
    }),
  }
}
