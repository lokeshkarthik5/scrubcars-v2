import { runInBackground } from '../../lib/background.js'
import { bookingReference } from '../../lib/booking-ops.js'
import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import { istDateKey, istMidnight } from '../../lib/ist.js'
import { logger } from '../../lib/logger.js'
import { failureReasonText } from '../../lib/ops-alert-messages.js'
import { alertOps, type OpsAlert } from '../../lib/ops-alerts.js'
import { summariseRefunds } from '../../lib/pilot-stats.js'
import {
  createRazorpayRefund,
  listRazorpayRefunds,
  RazorpayRefundError,
  type RazorpayRefund,
} from '../../lib/razorpay.js'
import {
  afterFailedRefund,
  appRefundNote,
  AUTO_REFUND_BY,
  AUTO_REFUND_LOOKBACK_MS,
  AUTO_REFUND_MAX_ATTEMPTS,
  AUTO_REFUND_SWEEP_LIMIT,
  autoRefundCause,
  autoRefundFitsCap,
  autoRefundHold,
  failureReasonFor,
  FOUND_REFUND_BY,
  razorpayRefundNotes,
  refundIdempotencyKey,
  refundToSend,
  refusalIsDefinite,
  sourceOfFoundRefund,
  unrecordedGatewayRefunds,
  type AutoRefundCause,
  type AutoRefundHold,
  type SendDecision,
} from '../../lib/refund-sending.js'
import {
  afterRefund,
  amountOwed,
  billOwed,
  billPaymentWhat,
  billRefundReason,
  bookingPaymentOwed,
  bookingRefundReason,
  checkoutOwed,
  checkRefund,
  isBillRefundable,
  isBookingPaymentRefundable,
  isCheckoutRefundable,
  isStrayBillPayment,
  owedSince,
  refundBase,
  paiseOf,
  refundBookingNote,
  rupeesOf,
  storedRefundNote,
  type GatewayRefundStatus,
  type RefundCheck,
  type RefundKind,
  type RefundSource,
} from '../../lib/refunds.js'
import {
  refundsRepository,
  type BillRefundRow,
  type BookingPaymentRefundRow,
  type CheckoutRefundRow,
  type Conn,
  type RefundRecordRow,
  type RefundWriteResult,
} from './refunds.repository.js'
import type { ListRefundsQuery, RecordRefundInput, RefundNowInput } from './refunds.validation.js'
import { customerRefund } from '../../lib/push-messages.js'
import { bookingsRepository } from '../bookings/bookings.repository.js'
import { pushService } from '../push/push.service.js'

import { giftCreditService } from '../gift-credit/gift-credit.service.js'
import { adminSubjectName } from '../admin-logins/admin-logins.service.js'
const log = logger.child({ module: 'refunds' })

/** How many refunds the Done tab shows, of each kind, newest first. */
const DONE_LIMIT = 100


/**
 * One refund to do, or done, as ops sees it on the Refunds page and on a
 * booking: whose money, how much, the Razorpay payment to refund, why it is
 * owed and since when, and — once done — the refund id, when and who.
 */
export interface RefundItem {
  kind: RefundKind
  /** The booking's id for its payment, the checkout's, or the bill's. */
  id: string
  bookingId: string | null
  /** The booking's reference, or the checkout's own short id. */
  reference: string
  customer: { name: string; phone: string }
  garageName: string
  amountPaid: string
  amountRefunded: string
  amountOwed: string
  /** The Razorpay payment ops searches the dashboard for to refund. */
  razorpayPaymentId: string | null
  reason: string
  /** When it became owed. */
  since: string | null
  refundedAt: string | null
  refundRef: string | null
  refundedBy: string | null
  refundNote: string | null
  /** Refunded, but not through Razorpay: `refundNote` says how. */
  outsideRazorpay: boolean
  /**
   * For a bill: whether it was the final bill or extra work (0041), so the
   * Refunds page names it. Null for a booking's payment and a checkout.
   */
  chargeKind: 'final_bill' | 'extra_work' | null
}

function toPaise(amount: string | null | undefined): number {
  return Math.round(Number(amount ?? 0) * 100)
}

type RefundColumns = {
  refundedAmount: string | null
  refundRef: string | null
  refundedAt: Date | null
  refundedBy: string | null
  refundNote: string | null
}

/** The refund half of an item, the same for every kind. */
function refundPart(row: RefundColumns, refunded: string) {
  return {
    amountRefunded: refunded,
    refundedAt: row.refundedAt?.toISOString() ?? null,
    refundRef: row.refundRef,
    refundedBy: row.refundedBy,
    refundNote: row.refundNote,
    outsideRazorpay: toPaise(refunded) > 0 && !row.refundRef,
  }
}

/**
 * What has gone back of a booking's payment so far. A payment marked
 * 'refunded' by hand before refunds were recorded has no amount on it: all
 * of it went back.
 */
function refundedOfPayment(row: Pick<BookingPaymentRefundRow, 'status' | 'amount' | 'refundedAmount'>): string {
  if (row.status === 'refunded') return row.refundedAmount ?? row.amount
  return row.refundedAmount ?? '0.00'
}

/** The facts lib/refunds.ts decides a booking's payment on, from its refunds row. */
function bookingForRefund(row: BookingPaymentRefundRow) {
  return {
    status: row.bookingStatus,
    noShow: row.noShow,
    moved: Boolean(row.moved),
    // A refund instead of a free redo (0051).
    guaranteeRefund: row.guaranteeRefundAt !== null,
  }
}

/**
 * A booking's payment as a refund item, or null when it is neither owed nor
 * refunded (a customer no-show, a booking still on, a moved one).
 */
function fromBookingPayment(row: BookingPaymentRefundRow): RefundItem | null {
  const booking = bookingForRefund(row)
  const refunded = refundedOfPayment(row)
  if (!isBookingPaymentRefundable(booking, row) && toPaise(refunded) === 0) return null

  return {
    kind: 'booking',
    id: row.bookingId,
    bookingId: row.bookingId,
    reference: bookingReference(row.bookingId),
    customer: { name: row.customerName, phone: row.customerPhone },
    garageName: row.garageName,
    amountPaid: row.amount,
    amountOwed: bookingPaymentOwed(booking, row),
    razorpayPaymentId: row.gatewayTxnId,
    reason: bookingRefundReason(row),
    since: owedSince(row.paidAt, row.guaranteeRefundAt ?? row.noShowMarkedAt ?? row.cancelledAt)?.toISOString() ?? null,
    ...refundPart(row, refunded),
    chargeKind: null,
  }
}

function fromCheckout(row: CheckoutRefundRow): RefundItem | null {
  const refunded = row.refundedAmount ?? '0.00'
  if (!isCheckoutRefundable(row) && toPaise(refunded) === 0) return null

  return {
    kind: 'checkout',
    id: row.intentId,
    bookingId: null,
    reference: bookingReference(row.intentId),
    customer: { name: row.customerName, phone: row.customerPhone },
    garageName: row.garageName,
    amountPaid: row.amount,
    amountOwed: checkoutOwed(row),
    razorpayPaymentId: row.paymentRef,
    reason: `Paid, no booking: ${failureReasonText(row.failureReason)}`,
    // The checkout fails within minutes of opening, and records no time of
    // its own for it, so it is dated from when it was opened.
    since: row.createdAt.toISOString(),
    ...refundPart(row, refunded),
    chargeKind: null,
  }
}

function fromBill(row: BillRefundRow): RefundItem | null {
  const booking = { status: row.bookingStatus, noShow: row.noShow }
  const refunded = row.refundedAmount ?? '0.00'
  if (!isBillRefundable(row, booking) && toPaise(refunded) === 0) return null

  return {
    kind: 'bill',
    id: row.chargeId,
    bookingId: row.bookingId,
    reference: bookingReference(row.bookingId),
    customer: { name: row.customerName, phone: row.customerPhone },
    garageName: row.garageName,
    amountPaid: row.amountDue,
    amountOwed: billOwed(row, booking),
    razorpayPaymentId: row.gatewayPaymentId,
    reason: billRefundReason(row),
    // A stray payment is owed from the moment it was recorded on the dead
    // bill, which is the bill's last change: recording a refund leaves
    // updated_at alone so this stays put.
    since: (isStrayBillPayment(row)
      ? row.updatedAt
      : owedSince(row.paidAt, row.noShowMarkedAt ?? row.cancelledAt)
    )?.toISOString() ?? null,
    ...refundPart(row, refunded),
    chargeKind: row.kind,
  }
}

function toItems(rows: {
  bookingPayments: BookingPaymentRefundRow[]
  checkouts?: CheckoutRefundRow[]
  bills: BillRefundRow[]
}): RefundItem[] {
  return [
    ...rows.bookingPayments.map(fromBookingPayment),
    ...(rows.checkouts ?? []).map(fromCheckout),
    ...rows.bills.map(fromBill),
  ].filter((item): item is RefundItem => item !== null)
}

const time = (iso: string | null) => (iso ? Date.parse(iso) : Number.POSITIVE_INFINITY)

/**
 * Who recorded it, as a name — the same rule as an admin's booking notes:
 * the shared break-glass login signs as 'admin', a personal admin login
 * (0058) with its name, a named super-admin as themselves.
 */
async function resolveActorName(sub: string): Promise<string> {
  const adminName = await adminSubjectName(sub)
  if (adminName) return adminName
  const user = await refundsRepository.findUserById(sub)
  return (user?.name.trim() || user?.phone || sub).slice(0, 100)
}

function notFound() {
  return new AppError(404, 'There is no payment to refund there.', 'REFUND_NOT_FOUND')
}

/**
 * The figures moved between ops opening the dialog and saving: someone else
 * recorded a refund on it, or this same refund already went through on an
 * earlier try whose answer was lost.
 */
function stateChanged() {
  return new AppError(
    409,
    'A refund was just recorded on this, so its figures have changed. Check the latest figures before recording another.',
    'REFUND_STATE_CHANGED'
  )
}

function refundRefUsed(where: string) {
  return new AppError(
    409,
    `That Razorpay refund id is already recorded on ${where}. Check you copied the right one.`,
    'REFUND_REF_USED'
  )
}

/**
 * The running total the write is conditional on (lib/refunds refundBase):
 * refused up front when what the dialog saw has moved on, so a retry of a
 * refund that already went through is never added on.
 */
function expectedTotal(seen: number | undefined, read: string | null): string {
  const base = refundBase(seen, read)
  if (base === null) throw stateChanged()
  return base
}

/** A refund write's answer, as the record or the refusal. */
function recorded<T>(result: RefundWriteResult<T>): T {
  switch (result.kind) {
    case 'recorded':
      return result.row
    case 'changed':
      throw stateChanged()
    case 'ref_used':
      throw refundRefUsed('another refund')
  }
}

/** Throws for anything but 'ok', in ops' words. */
function assertRecordable(check: RefundCheck, owed: string) {
  switch (check) {
    case 'ok':
      return
    case 'not_due':
      throw new AppError(
        400,
        "Nothing is owed back on this. A customer no-show keeps the payment, and a booking that's still on has nothing to refund.",
        'REFUND_NOT_DUE'
      )
    case 'already_refunded':
      throw new AppError(409, 'This has already been refunded in full.', 'ALREADY_REFUNDED')
    case 'too_much':
      throw new AppError(
        400,
        `That's more than is still owed. At most ₹${Number(owed).toLocaleString('en-IN', { maximumFractionDigits: 2 })} can be recorded.`,
        'REFUND_TOO_MUCH'
      )
  }
}

/**
 * Refuses a Razorpay refund id that is already recorded. It names one refund
 * of one payment, so seeing it twice means it was pasted onto the wrong row.
 */
async function assertRefundRefUnused(refundRef: string | undefined, conn: Conn) {
  if (!refundRef) return
  const used = await refundsRepository.findRefundRef(refundRef, conn)
  if (!used) return
  throw refundRefUsed(
    used.kind === 'checkout'
      ? `a checkout (${bookingReference(used.id)})`
      : `booking #${bookingReference(used.id)}`
  )
}

// ─── Sending through Razorpay ────────────────────────────────────────────────

/** One piece of money: a booking's payment, a checkout's, or a bill's. */
type Target = { kind: RefundKind; id: string }

/**
 * One piece of money, read fresh, in the shape every sending step needs:
 * what was paid and has gone back, whether it is to go back at all, the
 * Razorpay payment, and (for the automatic mode) why it is owed and since
 * when. `refundedColumn` is the money row's own running total, which every
 * write is conditional on.
 */
interface Money {
  target: Target
  bookingId: string | null
  /** The Razorpay payment, only when it is one (pay_…): an order id can't be refunded. */
  paymentId: string | null
  paid: string
  refunded: string
  refundedColumn: string | null
  refundable: boolean
  garageName: string
  cause: AutoRefundCause | null
  since: Date | null
  item: RefundItem | null
}

/** A Razorpay payment id the refund API takes; anything else is none. */
function refundablePaymentId(id: string | null | undefined): string | null {
  return id && id.startsWith('pay_') ? id : null
}

async function readMoney(target: Target, conn?: Conn): Promise<Money | null> {
  switch (target.kind) {
    case 'booking': {
      const row = await refundsRepository.findBookingPayment(target.id, conn)
      if (!row) return null
      const booking = bookingForRefund(row)
      return {
        target,
        bookingId: row.bookingId,
        paymentId: refundablePaymentId(row.gatewayTxnId),
        paid: row.amount,
        refunded: refundedOfPayment(row),
        refundedColumn: row.refundedAmount,
        refundable: isBookingPaymentRefundable(booking, row),
        garageName: row.garageName,
        cause: autoRefundCause({ ...booking, cancelledBy: row.cancelledBy }),
        since: owedSince(row.paidAt, row.guaranteeRefundAt ?? row.noShowMarkedAt ?? row.cancelledAt),
        item: fromBookingPayment(row),
      }
    }
    case 'checkout': {
      const row = await refundsRepository.findCheckout(target.id, conn)
      if (!row) return null
      const refundable = isCheckoutRefundable(row)
      return {
        target,
        bookingId: null,
        paymentId: refundablePaymentId(row.paymentRef),
        paid: row.amount,
        refunded: row.refundedAmount ?? '0.00',
        refundedColumn: row.refundedAmount,
        refundable,
        garageName: row.garageName,
        cause: refundable ? 'paid_no_booking' : null,
        since: row.createdAt,
        item: fromCheckout(row),
      }
    }
    case 'bill': {
      const row = await refundsRepository.findBill(target.id, conn)
      if (!row) return null
      const booking = { status: row.bookingStatus, noShow: row.noShow }
      return {
        target,
        bookingId: row.bookingId,
        paymentId: refundablePaymentId(row.gatewayPaymentId),
        paid: row.amountDue,
        refunded: row.refundedAmount ?? '0.00',
        refundedColumn: row.refundedAmount,
        refundable: isBillRefundable(row, booking),
        garageName: row.garageName,
        // Final-bill money is never refunded automatically.
        cause: null,
        since: null,
        item: fromBill(row),
      }
    }
  }
}

/**
 * The key a refund lock is taken on: the Razorpay payment, which is what can
 * be refunded twice, or the money's own id when it has none.
 */
async function lockKeyFor(target: Target): Promise<string> {
  const money = await readMoney(target)
  if (!money) throw notFound()
  return money.paymentId ?? money.item?.razorpayPaymentId ?? `${target.kind}:${target.id}`
}

const WHAT: Record<RefundKind, string> = {
  booking: 'the booking payment',
  checkout: 'the payment with no booking',
  bill: 'the final bill payment',
}

/** What a refund note says was refunded; a bill names its kind (0041). */
function whatOf(kind: RefundKind, chargeKind: string | null | undefined): string {
  return kind === 'bill' ? billPaymentWhat(chargeKind) : WHAT[kind]
}

/**
 * Records one refund on the money, whoever made it: the same write as Mark
 * refunded (conditional on the running total just read, with its history
 * row and booking note), with how it came about and where Razorpay says it
 * stands.
 */
async function writeRefund(
  money: Money,
  input: {
    amount: string
    refundRef: string
    source: RefundSource
    gatewayStatus: GatewayRefundStatus | null
    by: string
    refundNote: string | null
    at: Date
  },
  conn: Conn
): Promise<RefundWriteResult<unknown>> {
  const next = afterRefund(money.paid, money.refunded, input.amount)
  const write = {
    expectedRefunded: rupeesOf(paiseOf(money.refundedColumn)),
    amount: input.amount,
    refundedAmount: next.refundedAmount,
    refundRef: input.refundRef,
    refundedAt: input.at,
    refundedBy: input.by,
    refundNote: input.refundNote,
    source: input.source,
    gatewayStatus: input.gatewayStatus,
  }
  const note = {
    author: input.by,
    body: refundBookingNote({
      what: whatOf(money.target.kind, money.item?.chargeKind),
      amount: input.amount,
      full: next.full,
      refundRef: input.refundRef,
      source: input.source,
    }),
  }
  switch (money.target.kind) {
    case 'booking':
      return refundsRepository.recordBookingRefund(money.target.id, { ...write, full: next.full }, note, conn)
    case 'checkout':
      return refundsRepository.recordCheckoutRefund(money.target.id, write, conn)
    case 'bill':
      return refundsRepository.recordBillRefund(money.target.id, money.bookingId!, write, note, conn)
  }
}

/** The status a refund Razorpay just made is recorded with. */
function gatewayStatusOf(refund: Pick<RazorpayRefund, 'status'>): GatewayRefundStatus {
  return refund.status === 'processed' ? 'processed' : refund.status === 'failed' ? 'failed' : 'pending'
}

/**
 * Takes back a refund Razorpay failed (a webhook, or a check finding it
 * failed): its record kept as failed, the money owed again. Returns the
 * team's alert, or null when there was nothing to take back.
 */
async function takeBack(record: RefundRecordRow, reason: string, conn: Conn, now: Date): Promise<OpsAlert | null> {
  const target = { kind: record.kind, id: record.targetId }
  const money = await readMoney(target, conn)
  if (!money) return null
  const latest = await refundsRepository.latestStanding(record.kind, record.targetId, record.id, conn)
  const failed = await refundsRepository.failRefund(
    record,
    {
      expectedRefunded: rupeesOf(paiseOf(money.refundedColumn)),
      refundedAmount: afterFailedRefund(money.refundedColumn, record.amount).refundedAmount,
      latest,
      reason,
      at: now,
    },
    {
      author: 'Detlio (automatic)',
      body: `The refund of ₹${Number(record.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })} of ${whatOf(record.kind, money.item?.chargeKind)} in Razorpay (${record.refundRef ?? 'no refund id'}) failed: ${reason} The money is owed again.`,
    },
    conn
  )
  if (!failed) {
    log.error({ recordId: record.id, refundRef: record.refundRef }, 'refund:take_back_skipped')
    return null
  }
  log.warn({ recordId: record.id, refundRef: record.refundRef, kind: record.kind, targetId: record.targetId }, 'refund:failed_taken_back')
  const attempts = await refundsRepository.countFailedAttempts(record.kind, record.targetId, conn)
  return {
    kind: 'refund_failed',
    what: record.kind,
    bookingId: record.bookingId,
    amount: record.amount,
    refundRef: record.refundRef,
    paymentId: money.paymentId,
    reason,
    auto: record.source === 'auto',
    gaveUp: record.source === 'auto' && attempts >= AUTO_REFUND_MAX_ATTEMPTS,
  }
}

/** What a check of Razorpay came to, inside the lock. */
type SyncResult =
  | { kind: 'ok'; alerts: OpsAlert[] }
  /** Razorpay holds refunds of this payment that don't fit what is owed here. */
  | { kind: 'mismatch'; alerts: OpsAlert[]; refundRef: string }
  /** Razorpay could not be asked. */
  | { kind: 'unavailable'; alerts: OpsAlert[]; error: RazorpayRefundError }

/**
 * Brings our records in line with Razorpay before anything is sent: reads
 * the payment's refunds there, settles our pending ones whose outcome
 * Razorpay already knows (a missed webhook), and records any refund we have
 * no record of — done by hand in the dashboard, or ours with its answer
 * lost — so it is never sent again. A refund that doesn't fit what is owed
 * here stops everything: a person has to look.
 */
async function syncWithRazorpay(money: Money, conn: Conn, now: Date): Promise<SyncResult> {
  const alerts: OpsAlert[] = []
  if (!money.paymentId) return { kind: 'ok', alerts }

  let gateway: RazorpayRefund[]
  try {
    gateway = await listRazorpayRefunds(money.paymentId)
  } catch (error) {
    if (error instanceof RazorpayRefundError) return { kind: 'unavailable', alerts, error }
    throw error
  }

  for (const record of await refundsRepository.listPendingForTarget(money.target.kind, money.target.id, conn)) {
    const there = gateway.find((refund) => refund.id === record.refundRef)
    if (there?.status === 'processed') await refundsRepository.markProcessed(record.id, now, conn)
    if (there?.status === 'failed') {
      const alert = await takeBack(record, 'Razorpay could not complete the refund.', conn, now)
      if (alert) alerts.push(alert)
    }
  }

  const recorded = await refundsRepository.findRecordedRefs(gateway.map((refund) => refund.id), conn)
  // Razorpay lists newest first; recorded oldest first, as they were made.
  for (const found of unrecordedGatewayRefunds(gateway, recorded).reverse()) {
    const current = await readMoney(money.target, conn)
    const amount = rupeesOf(found.amountPaise)
    const fits =
      current !== null &&
      checkRefund({ refundable: current.refundable, paid: current.paid, refunded: current.refunded, amount }) === 'ok'
    if (!current || !fits) {
      log.error({ ...money.target, paymentId: money.paymentId, refundRef: found.id, amount }, 'refund:razorpay_mismatch')
      alerts.push({
        kind: 'refund_failed',
        what: money.target.kind,
        bookingId: money.bookingId,
        amount,
        refundRef: found.id,
        paymentId: money.paymentId,
        reason: `Razorpay holds a refund on this payment that doesn't fit what is owed here, so nothing more was sent. Check the payment in Razorpay and record it by hand.`,
        auto: false,
        gaveUp: true,
      })
      return { kind: 'mismatch', alerts, refundRef: found.id }
    }
    const source = sourceOfFoundRefund(found, money.target)
    const by = source === 'auto' ? AUTO_REFUND_BY : FOUND_REFUND_BY
    const write = await writeRefund(
      current,
      {
        amount,
        refundRef: found.id,
        source,
        gatewayStatus: gatewayStatusOf(found),
        by,
        refundNote: source === 'razorpay' ? 'Done in the Razorpay dashboard; found there and recorded by the app.' : appRefundNote(source, by),
        at: now,
      },
      conn
    )
    if (write.kind !== 'recorded') {
      log.error({ ...money.target, refundRef: found.id, result: write.kind }, 'refund:found_not_recorded')
      return { kind: 'mismatch', alerts, refundRef: found.id }
    }
    log.info({ ...money.target, refundRef: found.id, amount, source }, 'refund:found_in_razorpay')
    const after = await readMoney(money.target, conn)
    alerts.push({
      kind: 'refund_recorded',
      what: money.target.kind,
      bookingId: money.bookingId,
      garageName: money.garageName,
      amount,
      paid: money.paid,
      refundedTotal: after?.refunded ?? amount,
      refundRef: found.id,
      paymentId: money.paymentId,
      by,
    })
  }
  return { kind: 'ok', alerts }
}

/** What one send came to. Errors and alerts are dealt with after the commit. */
type SendOutcome =
  | { kind: 'sent'; refund: RazorpayRefund; amount: string; money: Money; refundedTotal: string }
  | { kind: 'held'; hold: AutoRefundHold }
  | { kind: 'refused'; decision: Exclude<SendDecision, { kind: 'send' }>; owed: string }
  | { kind: 'state_changed' }
  | { kind: 'mismatch' }
  | { kind: 'unavailable' }
  /** Razorpay refused it outright: nothing was made, and the try is recorded. */
  | { kind: 'gateway_refused'; reason: string }
  /** Razorpay did not say. The next check of Razorpay finds out. */
  | { kind: 'gateway_unknown' }
  /** Sent, but the record could not be written; the next check records it. */
  | { kind: 'sent_unrecorded'; refundRef: string }

/**
 * The automatic mode's holds that need the database: everything in
 * autoRefundHold, with the booking's complaints and the failed tries so far.
 */
async function autoHold(money: Money, conn: Conn, now: Date): Promise<AutoRefundHold | null> {
  const owed = money.refundable ? amountOwed(money.paid, money.refunded) : '0.00'
  const quick = autoRefundHold({
    kind: money.target.kind,
    owed,
    refunded: money.refunded,
    paymentId: money.paymentId,
    cause: money.cause,
    complaintOpen: false,
    failedAttempts: 0,
    since: money.since,
    now,
  })
  if (quick) return quick
  const [complaintOpen, failedAttempts] = await Promise.all([
    money.bookingId ? refundsRepository.hasOpenComplaint(money.bookingId, conn) : Promise.resolve(false),
    refundsRepository.countFailedAttempts(money.target.kind, money.target.id, conn),
  ])
  return autoRefundHold({
    kind: money.target.kind,
    owed,
    refunded: money.refunded,
    paymentId: money.paymentId,
    cause: money.cause,
    complaintOpen,
    failedAttempts,
    since: money.since,
    now,
  })
}

/**
 * Sends one refund through Razorpay, under the payment's refund lock: check
 * Razorpay first (syncWithRazorpay), then send only what is still owed, then
 * record it exactly like a manual refund, with the Razorpay refund id and
 * the marker that the app sent it.
 *
 * The lock's transaction is never thrown out of once something is written
 * (a refund found on Razorpay, a failed try): the outcome is returned and
 * acted on after the commit, so what was learnt is kept.
 */
async function sendThroughRazorpay(
  target: Target,
  options: {
    source: 'admin' | 'auto'
    by: string
    /** A part amount from the button; everything owed when not given. */
    requested?: string
    /** What the button's sheet saw refunded, when it was opened. */
    expectedRefunded?: number
    note?: string
    now: Date
  }
): Promise<{ outcome: SendOutcome; alerts: OpsAlert[] } | { busy: true }> {
  const { source, now } = options
  const alerts: OpsAlert[] = []
  const locked = await refundsRepository.withRefundLock(await lockKeyFor(target), { wait: false }, async (tx) => {
    const run = async (): Promise<SendOutcome> => {
      const first = await readMoney(target, tx)
      if (!first) return { kind: 'refused', decision: { kind: 'not_due' }, owed: '0.00' }

      // The automatic mode stops before asking Razorpay anything when the
      // money is not its to send.
      if (source === 'auto') {
        const hold = await autoHold(first, tx, now)
        if (hold) return { kind: 'held', hold }
      }

      const sync = await syncWithRazorpay(first, tx, now)
      alerts.push(...sync.alerts)
      if (sync.kind === 'mismatch') {
        // Counted as a failed try, so the automatic mode stops asking (and
        // alerting) after its last one instead of every cron run.
        if (source === 'auto') {
          await refundsRepository.recordFailedAttempt(
            {
              kind: target.kind,
              targetId: target.id,
              bookingId: first.bookingId,
              amount: amountOwed(first.paid, first.refunded),
              refundedBefore: rupeesOf(paiseOf(first.refundedColumn)),
              source,
              by: options.by,
              reason: `Razorpay holds refund ${sync.refundRef}, which doesn't fit what is owed here.`,
              at: now,
            },
            tx
          )
        }
        return { kind: 'mismatch' }
      }
      if (sync.kind === 'unavailable') {
        log.warn({ ...target, status: sync.error.status, description: sync.error.description }, 'refund:razorpay_unavailable')
        return { kind: 'unavailable' }
      }

      const money = (await readMoney(target, tx))!
      // What the sheet showed has moved on (a refund was found on Razorpay,
      // or someone recorded one): the person decides again, on the new
      // figures.
      if (options.expectedRefunded !== undefined && refundBase(options.expectedRefunded, money.refundedColumn) === null) {
        return { kind: 'state_changed' }
      }

      if (source === 'auto') {
        const hold = await autoHold(money, tx, now)
        if (hold) return { kind: 'held', hold }
      }

      const decision = refundToSend({
        refundable: money.refundable,
        paid: money.paid,
        refunded: money.refunded,
        paymentId: money.paymentId,
        requested: options.requested,
      })
      if (decision.kind !== 'send') {
        return { kind: 'refused', decision, owed: amountOwed(money.paid, money.refunded) }
      }

      if (source === 'auto') {
        await refundsRepository.lockAutoRefundCap(tx)
        const day = istDateKey(now)
        if (await refundsRepository.capReachedOn(day, tx)) return { kind: 'held', hold: 'daily_cap' }
        const sentToday = await refundsRepository.autoRefundedSince(istMidnight(day), tx)
        const cap = env.autoRefundDailyCapInr
        if (!autoRefundFitsCap({ sentToday, amount: decision.amount, cap })) {
          const firstToday = await refundsRepository.markCapReached({ day, cap: rupeesOf(paiseOf(cap)), sent: sentToday }, tx)
          if (firstToday) alerts.push({ kind: 'auto_refund_cap_reached', cap: rupeesOf(paiseOf(cap)), sentToday })
          log.warn({ day, cap, sentToday, ...target }, 'refund:auto_cap_reached')
          return { kind: 'held', hold: 'daily_cap' }
        }
      }

      const attempt = await refundsRepository.countFailedAttempts(target.kind, target.id, tx)
      const refundedBefore = rupeesOf(paiseOf(money.refundedColumn))
      let refund: RazorpayRefund
      try {
        refund = await createRazorpayRefund({
          paymentId: money.paymentId!,
          amountPaise: paiseOf(decision.amount),
          notes: razorpayRefundNotes({ kind: target.kind, id: target.id, bookingId: money.bookingId, source }),
          idempotencyKey: refundIdempotencyKey({
            kind: target.kind,
            targetId: target.id,
            refundedBefore,
            attempt,
            amount: decision.amount,
            source,
          }),
        })
      } catch (error) {
        if (!(error instanceof RazorpayRefundError)) throw error
        log.error({ ...target, status: error.status, description: error.description, source }, 'refund:razorpay_refused')
        if (!refusalIsDefinite(error.status)) return { kind: 'gateway_unknown' }
        const reason = failureReasonFor(error.description, 'Razorpay refused the refund.')
        await refundsRepository.recordFailedAttempt(
          {
            kind: target.kind,
            targetId: target.id,
            bookingId: money.bookingId,
            amount: decision.amount,
            refundedBefore,
            source,
            by: options.by,
            reason,
            at: now,
          },
          tx
        )
        alerts.push({
          kind: 'refund_failed',
          what: target.kind,
          bookingId: money.bookingId,
          amount: decision.amount,
          refundRef: null,
          paymentId: money.paymentId,
          reason,
          auto: source === 'auto',
          gaveUp: source === 'auto' && attempt + 1 >= AUTO_REFUND_MAX_ATTEMPTS,
        })
        return { kind: 'gateway_refused', reason }
      }

      const write = await writeRefund(
        money,
        {
          amount: rupeesOf(refund.amountPaise),
          refundRef: refund.id,
          source,
          gatewayStatus: gatewayStatusOf(refund),
          by: options.by,
          refundNote: appRefundNote(source, options.by, options.note),
          at: now,
        },
        tx
      )
      if (write.kind !== 'recorded') {
        // Sent, and the record would not go in. The refund exists on
        // Razorpay, so the next check of this payment records it.
        log.error({ ...target, refundRef: refund.id, result: write.kind }, 'refund:sent_not_recorded')
        return { kind: 'sent_unrecorded', refundRef: refund.id }
      }
      const after = (await readMoney(target, tx))!
      return { kind: 'sent', refund, amount: rupeesOf(refund.amountPaise), money: after, refundedTotal: after.refunded }
    }
    return run()
  })
  if (locked.kind === 'busy') return { busy: true }
  return { outcome: locked.value, alerts }
}

function refundBusy() {
  return new AppError(
    409,
    'A refund is being sent or recorded on this payment right now. Wait a moment and check the figures again.',
    'REFUND_BUSY'
  )
}

/** The button's refusals, in ops' words. */
function sendRefusal(outcome: Exclude<SendOutcome, { kind: 'sent' } | { kind: 'held' }>): AppError {
  switch (outcome.kind) {
    case 'refused':
      switch (outcome.decision.kind) {
        case 'no_payment':
          return new AppError(
            400,
            'There is no Razorpay payment on this to refund. Refund it another way and use Mark refunded.',
            'REFUND_NO_PAYMENT'
          )
        case 'not_due':
          return new AppError(400, "Nothing is owed back on this, so nothing was sent.", 'REFUND_NOT_DUE')
        case 'already_refunded':
          return new AppError(409, 'This has already been refunded in full.', 'ALREADY_REFUNDED')
        case 'too_much':
          return new AppError(
            400,
            `That's more than is still owed. At most ₹${Number(outcome.owed).toLocaleString('en-IN', { maximumFractionDigits: 2 })} can be sent.`,
            'REFUND_TOO_MUCH'
          )
      }
      break
    case 'state_changed':
      return new AppError(
        409,
        'The figures on this changed since you opened it (a refund was found in Razorpay or recorded here). Nothing was sent. Check the latest figures.',
        'REFUND_STATE_CHANGED'
      )
    case 'mismatch':
      return new AppError(
        409,
        "Razorpay already holds a refund on this payment that doesn't match what is owed here, so nothing was sent. Check the payment in Razorpay.",
        'REFUND_RAZORPAY_MISMATCH'
      )
    case 'unavailable':
      return new AppError(
        503,
        "Couldn't check Razorpay for refunds already made on this payment, so nothing was sent. Try again in a minute.",
        'RAZORPAY_UNAVAILABLE'
      )
    case 'gateway_refused':
      return new AppError(502, `Razorpay refused the refund: ${outcome.reason} Nothing was sent.`, 'RAZORPAY_REFUND_FAILED')
    case 'gateway_unknown':
      return new AppError(
        503,
        "Razorpay didn't answer, so it isn't known yet whether the refund was made. Wait a minute and press Refund now again: it checks Razorpay first and never sends twice.",
        'RAZORPAY_REFUND_UNKNOWN'
      )
    case 'sent_unrecorded':
      return new AppError(
        409,
        `The refund was sent (${outcome.refundRef}) but couldn't be recorded just now. Press Refund now again to record it; nothing more will be sent.`,
        'REFUND_SENT_NOT_RECORDED'
      )
  }
  return new AppError(500, 'The refund could not be sent.', 'REFUND_FAILED')
}

/** The team's alert for a refund the app sent. */
function sentAlert(outcome: Extract<SendOutcome, { kind: 'sent' }>, auto: boolean, by: string): OpsAlert {
  return {
    kind: 'refund_sent',
    what: outcome.money.target.kind,
    bookingId: outcome.money.bookingId,
    garageName: outcome.money.garageName,
    amount: outcome.amount,
    paid: outcome.money.paid,
    refundedTotal: outcome.refundedTotal,
    refundRef: outcome.refund.id,
    paymentId: outcome.money.paymentId,
    auto,
    by,
  }
}

/**
 * Tells the customer a refund on their booking went out (0044): "Refund of
 * ₹X started" when sent through Razorpay, "₹X refunded" when ops recorded
 * one done another way. A checkout that became no booking has no booking
 * page to open, so it says nothing here.
 */
function notifyCustomerOfRefund(bookingId: string | null, amount: string, started: boolean) {
  if (!bookingId) return
  pushService.notifyLater(async () => {
    const booking = await bookingsRepository.findBookingById(bookingId)
    return booking
      ? [{ recipient: { audience: 'customer', userId: booking.userId }, message: customerRefund(booking, amount, started) }]
      : []
  })
}

/** What one automatic refund came to, for the cron's summary and the logs. */
export type AutoRefundOutcome = 'off' | 'sent' | AutoRefundHold | 'busy' | 'failed' | 'unavailable'

/**
 * How long one cron run keeps starting refunds. cron-job.org gives up on a
 * request after 30 seconds, and the digest still has to run after this. A
 * run cut off mid-refund loses nothing: the refund, if Razorpay made it, is
 * found and recorded by the next check of that payment.
 */
const SWEEP_BUDGET_MS = 15_000

export const refundsService = {
  /**
   * The Refunds page. Owed: everything still to give back, oldest first, so
   * whoever is waiting longest is at the top. Done: what has been refunded,
   * newest first.
   */
  async listRefunds(query: ListRefundsQuery): Promise<RefundItem[]> {
    if (query.status === 'owed') {
      const items = toItems(await refundsRepository.listMaybeOwed())
      return items
        .filter((item) => toPaise(item.amountOwed) > 0)
        .sort((a, b) => time(a.since) - time(b.since))
    }

    const items = toItems(await refundsRepository.listRefunded(DONE_LIMIT))
    return items
      .filter((item) => toPaise(item.amountRefunded) > 0)
      .sort((a, b) => time(b.refundedAt) - time(a.refundedAt))
      .slice(0, DONE_LIMIT)
  },

  /** A booking's refunds, owed or done, for its admin page. */
  async listForBooking(bookingId: string): Promise<RefundItem[]> {
    return toItems(await refundsRepository.listForBooking(bookingId))
  },

  /**
   * Records a refund ops did in Razorpay (or by UPI or bank), once.
   *
   * The amount is checked against what is still owed, as read; the write is
   * conditional on the running total being what the dialog saw when it
   * opened (`expectedRefunded`, or the total just read when it isn't sent),
   * so two people recording the same refund, a double-tap, or a retry after
   * a lost response record it once, and the others are told. A refund id
   * already recorded on any refund is refused, by the unique index on
   * refund_records when two arrive at once. Leaves a booking note when there
   * is a booking, and tells the team on Telegram.
   */
  async recordRefund(sub: string, input: RecordRefundInput, now = new Date()): Promise<RefundItem> {
    const by = await resolveActorName(sub)
    const amount = input.amount.toFixed(2)
    const refundNote = storedRefundNote(input)
    const refundRef = input.refundRef ?? null
    const noteFor = (what: string, full: boolean) => ({
      author: by,
      body: refundBookingNote({
        what,
        amount,
        full,
        refundRef,
        outsideRazorpayNote: input.outsideRazorpayNote,
        note: input.note,
      }),
    })

    // Under the payment's refund lock, so a refund being sent through
    // Razorpay on the same money can't land between the read and the write.
    const locked = await refundsRepository.withRefundLock(
      await lockKeyFor(input),
      { wait: false },
      async (tx): Promise<{ item: RefundItem | null; paid: string; refundedTotal: string; garageName: string }> => {
        let item: RefundItem | null
        let paid: string
        let refundedTotal: string
        let garageName: string

        switch (input.kind) {
          case 'booking': {
            const row = await refundsRepository.findBookingPayment(input.id, tx)
            if (!row) throw notFound()
            const booking = bookingForRefund(row)
            const refunded = refundedOfPayment(row)
            assertRecordable(
              checkRefund({
                refundable: isBookingPaymentRefundable(booking, row),
                paid: row.amount,
                refunded,
                amount,
              }),
              amountOwed(row.amount, refunded)
            )
            const expected = expectedTotal(input.expectedRefunded, row.refundedAmount)
            await assertRefundRefUnused(input.refundRef, tx)

            const next = afterRefund(row.amount, refunded, amount)
            recorded(
              await refundsRepository.recordBookingRefund(
                row.bookingId,
                {
                  expectedRefunded: expected,
                  amount,
                  refundedAmount: next.refundedAmount,
                  full: next.full,
                  refundRef,
                  refundedAt: now,
                  refundedBy: by,
                  refundNote,
                },
                noteFor('the booking payment', next.full),
                tx
              )
            )

            paid = row.amount
            refundedTotal = next.refundedAmount
            garageName = row.garageName
            const fresh = await refundsRepository.findBookingPayment(row.bookingId, tx)
            item = fresh ? fromBookingPayment(fresh) : null
            break
          }

          case 'checkout': {
            const row = await refundsRepository.findCheckout(input.id, tx)
            if (!row) throw notFound()
            const refunded = row.refundedAmount ?? '0.00'
            assertRecordable(
              checkRefund({ refundable: isCheckoutRefundable(row), paid: row.amount, refunded, amount }),
              amountOwed(row.amount, refunded)
            )
            const expected = expectedTotal(input.expectedRefunded, refunded)
            await assertRefundRefUnused(input.refundRef, tx)

            const next = afterRefund(row.amount, refunded, amount)
            recorded(
              await refundsRepository.recordCheckoutRefund(row.intentId, {
                expectedRefunded: expected,
                amount,
                refundedAmount: next.refundedAmount,
                refundRef,
                refundedAt: now,
                refundedBy: by,
                refundNote,
              }, tx)
            )

            paid = row.amount
            refundedTotal = next.refundedAmount
            garageName = row.garageName
            const fresh = await refundsRepository.findCheckout(row.intentId, tx)
            item = fresh ? fromCheckout(fresh) : null
            break
          }

          case 'bill': {
            const row = await refundsRepository.findBill(input.id, tx)
            if (!row) throw notFound()
            const booking = { status: row.bookingStatus, noShow: row.noShow }
            const refunded = row.refundedAmount ?? '0.00'
            assertRecordable(
              checkRefund({ refundable: isBillRefundable(row, booking), paid: row.amountDue, refunded, amount }),
              amountOwed(row.amountDue, refunded)
            )
            const expected = expectedTotal(input.expectedRefunded, refunded)
            await assertRefundRefUnused(input.refundRef, tx)

            const next = afterRefund(row.amountDue, refunded, amount)
            recorded(
              await refundsRepository.recordBillRefund(
                row.chargeId,
                row.bookingId,
                {
                  expectedRefunded: expected,
                  amount,
                  refundedAmount: next.refundedAmount,
                  refundRef,
                  refundedAt: now,
                  refundedBy: by,
                  refundNote,
                },
                noteFor('the final bill payment', next.full),
                tx
              )
            )

            paid = row.amountDue
            refundedTotal = next.refundedAmount
            garageName = row.garageName
            const fresh = await refundsRepository.findBill(row.chargeId, tx)
            item = fresh ? fromBill(fresh) : null
            break
          }
        }

        return { item, paid, refundedTotal, garageName }
      }
    )
    if (locked.kind === 'busy') throw refundBusy()
    const { item, paid, refundedTotal, garageName } = locked.value

    if (!item) throw notFound()

    log.info(
      { kind: input.kind, id: input.id, amount, refundedTotal, refundRef, outside: !refundRef, by },
      'refund:recorded'
    )
    notifyCustomerOfRefund(item.bookingId, amount, false)
    alertOps({
      kind: 'refund_recorded',
      what: input.kind,
      bookingId: item.bookingId,
      garageName,
      amount,
      paid,
      refundedTotal,
      refundRef,
      paymentId: item.razorpayPaymentId,
      by,
    })

    return item
  },

  /**
   * The refunds figures on the pilot card: everything still owed (a to-do
   * list, so not windowed) and what was refunded since `since`.
   */
  async pilotRefunds(since: Date) {
    const [owed, recorded] = await Promise.all([
      refundsService.listRefunds({ status: 'owed' }),
      refundsRepository.listRefundedSince(since),
    ])
    return summariseRefunds(owed, recorded)
  },

  /**
   * Refund now: sends a refund through Razorpay from the admin panel, for
   * everything still owed or a part of it (never more), and records it
   * exactly like a manual one: the Razorpay refund id, who (the admin, as
   * their notes are signed) and that it went from the app. Razorpay is read
   * first, so a refund already done in the dashboard is recorded instead of
   * sent again. `expectedRefunded` is what the sheet showed refunded: if
   * that moved, nothing is sent and the admin sees the new figures.
   */
  async refundNow(sub: string, input: RefundNowInput, now = new Date()): Promise<RefundItem> {
    const by = await resolveActorName(sub)
    const target = { kind: input.kind, id: input.id }
    const result = await sendThroughRazorpay(target, {
      source: 'admin',
      by,
      requested: input.amount === undefined ? undefined : input.amount.toFixed(2),
      expectedRefunded: input.expectedRefunded,
      note: input.note,
      now,
    })
    if ('busy' in result) throw refundBusy()
    for (const alert of result.alerts) alertOps(alert)

    const { outcome } = result
    if (outcome.kind === 'held') throw new AppError(500, 'The refund could not be sent.', 'REFUND_FAILED')
    if (outcome.kind !== 'sent') throw sendRefusal(outcome)

    log.info({ ...target, amount: outcome.amount, refundRef: outcome.refund.id, by }, 'refund:sent')
    alertOps(sentAlert(outcome, false, by))
    notifyCustomerOfRefund(outcome.money.bookingId, outcome.amount, true)
    if (!outcome.money.item) throw notFound()
    return outcome.money.item
  },

  /**
   * After a cancel (or a checkout that became no booking) commits: refunds
   * it automatically, after the response, when AUTO_REFUNDS is on. Does
   * nothing at all — no read, no task — while it is off. Whether this money
   * may go automatically is decided inside, under the lock; the cron sweep
   * picks up anything this misses.
   *
   * Every cancel path calls this, so it is also where a booking paid partly
   * or wholly with Detlio credit (0049) gets that part back, as credit and
   * never as cash, whatever AUTO_REFUNDS says: the gift-credit module
   * decides, under the customer's credit lock, whether anything is owed
   * back (lib/refunds.ts) and does it once. The Razorpay part is refunded
   * exactly as before.
   */
  queueAutoRefund(target: Target): void {
    if (target.kind === 'booking') giftCreditService.returnCreditLater(target.id)
    if (!env.autoRefunds) return
    runInBackground('auto_refund', () => refundsService.autoRefund(target))
  },

  /** One automatic refund, if this money is the automatic mode's to send. */
  async autoRefund(target: Target, now = new Date()): Promise<AutoRefundOutcome> {
    if (!env.autoRefunds) return 'off'
    const result = await sendThroughRazorpay(target, { source: 'auto', by: AUTO_REFUND_BY, now })
    if ('busy' in result) return 'busy'
    for (const alert of result.alerts) alertOps(alert)

    const { outcome } = result
    switch (outcome.kind) {
      case 'sent':
        log.info({ ...target, amount: outcome.amount, refundRef: outcome.refund.id }, 'refund:auto_sent')
        alertOps(sentAlert(outcome, true, AUTO_REFUND_BY))
        notifyCustomerOfRefund(outcome.money.bookingId, outcome.amount, true)
        return 'sent'
      case 'held':
        log.info({ ...target, hold: outcome.hold }, 'refund:auto_held')
        return outcome.hold
      case 'unavailable':
      case 'gateway_unknown':
        return 'unavailable'
      default:
        log.warn({ ...target, outcome: outcome.kind }, 'refund:auto_not_sent')
        return 'failed'
    }
  },

  /**
   * The automatic mode's retry, run with the pending-digest cron (every 10
   * minutes): every refund it may send that is still owed, oldest first, at
   * most AUTO_REFUND_SWEEP_LIMIT a run and within a time budget. Stops at
   * the daily cap, and when Razorpay can't be reached (the rest would fail
   * the same way). A dry run only counts.
   */
  async sweepAutoRefunds(options: { dryRun: boolean }) {
    if (!env.autoRefunds) return { enabled: false as const }
    const now = Date.now()
    const candidates = toItems(await refundsRepository.listMaybeOwed())
      .filter(
        (item) =>
          item.kind !== 'bill' &&
          toPaise(item.amountOwed) > 0 &&
          toPaise(item.amountRefunded) === 0 &&
          refundablePaymentId(item.razorpayPaymentId) !== null &&
          item.since !== null &&
          now - Date.parse(item.since) <= AUTO_REFUND_LOOKBACK_MS
      )
      .sort((a, b) => time(a.since) - time(b.since))

    const summary = {
      enabled: true as const,
      candidates: candidates.length,
      tried: 0,
      sent: 0,
      held: 0,
      failed: 0,
      stopped: null as null | 'daily_cap' | 'unavailable' | 'time',
    }
    if (options.dryRun) return summary

    for (const item of candidates) {
      if (summary.tried >= AUTO_REFUND_SWEEP_LIMIT) break
      if (Date.now() - now > SWEEP_BUDGET_MS) {
        summary.stopped = 'time'
        break
      }
      summary.tried += 1
      let outcome: AutoRefundOutcome
      try {
        outcome = await refundsService.autoRefund({ kind: item.kind, id: item.id })
      } catch (err) {
        log.error({ err, kind: item.kind, id: item.id }, 'refund:auto_sweep_item_failed')
        summary.failed += 1
        continue
      }
      if (outcome === 'sent') summary.sent += 1
      else if (outcome === 'failed') summary.failed += 1
      else summary.held += 1
      if (outcome === 'daily_cap' || outcome === 'unavailable') {
        summary.stopped = outcome
        break
      }
    }
    log.info(summary, 'refund:auto_sweep')
    return summary
  },

  /**
   * Razorpay's refund.processed and refund.failed, from the signed webhook.
   * Only refunds recorded here are touched: a refund done in the dashboard
   * and not yet marked is left for Mark refunded (or the next Refund now,
   * which finds it). A failed one is taken back, so the money shows as owed
   * again, and the team is told. Redeliveries change nothing.
   */
  async handleGatewayRefund(
    event: string,
    entity: { id?: string; payment_id?: string } | undefined,
    now = new Date()
  ): Promise<{ handled: boolean; event: string }> {
    if (!entity?.id || (event !== 'refund.processed' && event !== 'refund.failed')) {
      return { handled: false, event }
    }
    const refundRef = entity.id
    const record = await refundsRepository.findRecordByRef(refundRef)
    if (!record) {
      log.info({ event, refundRef, paymentId: entity.payment_id }, 'webhook:refund_not_recorded')
      return { handled: true, event }
    }

    const key =
      refundablePaymentId(entity.payment_id) ?? (await lockKeyFor({ kind: record.kind, id: record.targetId }))
    const locked = await refundsRepository.withRefundLock(key, { wait: true }, async (tx) => {
      const fresh = await refundsRepository.findRecordByRef(refundRef, tx)
      if (!fresh) return null
      if (event === 'refund.processed') {
        await refundsRepository.markProcessed(fresh.id, now, tx)
        return null
      }
      return takeBack(fresh, 'Razorpay could not complete the refund.', tx, now)
    })
    if (locked.kind === 'done' && locked.value) alertOps(locked.value)
    log.info({ event, refundRef, kind: record.kind, targetId: record.targetId }, 'webhook:refund_settled')
    return { handled: true, event }
  },
}
