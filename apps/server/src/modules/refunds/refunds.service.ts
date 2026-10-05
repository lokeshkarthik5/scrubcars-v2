import { bookingReference } from '../../lib/booking-ops.js'
import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { failureReasonText } from '../../lib/ops-alert-messages.js'
import { alertOps } from '../../lib/ops-alerts.js'
import { summariseRefunds } from '../../lib/pilot-stats.js'
import {
  afterRefund,
  amountOwed,
  billOwed,
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
  refundBookingNote,
  storedRefundNote,
  type RefundCheck,
  type RefundKind,
} from '../../lib/refunds.js'
import {
  refundsRepository,
  type BillRefundRow,
  type BookingPaymentRefundRow,
  type CheckoutRefundRow,
  type RefundWriteResult,
} from './refunds.repository.js'
import type { ListRefundsQuery, RecordRefundInput } from './refunds.validation.js'

const log = logger.child({ module: 'refunds' })

/** How many refunds the Done tab shows, of each kind, newest first. */
const DONE_LIMIT = 100

/** The subject of the env-credential break-glass login; see auth.middleware. */
const BREAK_GLASS_SUBJECT = 'admin'

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

/**
 * A booking's payment as a refund item, or null when it is neither owed nor
 * refunded (a customer no-show, a booking still on, a moved one).
 */
function fromBookingPayment(row: BookingPaymentRefundRow): RefundItem | null {
  const booking = { status: row.bookingStatus, noShow: row.noShow, moved: Boolean(row.moved) }
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
    since: owedSince(row.paidAt, row.noShowMarkedAt ?? row.cancelledAt)?.toISOString() ?? null,
    ...refundPart(row, refunded),
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
 * the shared break-glass login signs as 'admin', a named super-admin as
 * themselves.
 */
async function resolveActorName(sub: string): Promise<string> {
  if (sub === BREAK_GLASS_SUBJECT) return 'admin'
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
async function assertRefundRefUnused(refundRef: string | undefined) {
  if (!refundRef) return
  const used = await refundsRepository.findRefundRef(refundRef)
  if (!used) return
  throw refundRefUsed(
    used.kind === 'checkout'
      ? `a checkout (${bookingReference(used.id)})`
      : `booking #${bookingReference(used.id)}`
  )
}

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

    let item: RefundItem | null
    let paid: string
    let refundedTotal: string
    let garageName: string

    switch (input.kind) {
      case 'booking': {
        const row = await refundsRepository.findBookingPayment(input.id)
        if (!row) throw notFound()
        const booking = { status: row.bookingStatus, noShow: row.noShow, moved: Boolean(row.moved) }
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
        await assertRefundRefUnused(input.refundRef)

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
            noteFor('the booking payment', next.full)
          )
        )

        paid = row.amount
        refundedTotal = next.refundedAmount
        garageName = row.garageName
        const fresh = await refundsRepository.findBookingPayment(row.bookingId)
        item = fresh ? fromBookingPayment(fresh) : null
        break
      }

      case 'checkout': {
        const row = await refundsRepository.findCheckout(input.id)
        if (!row) throw notFound()
        const refunded = row.refundedAmount ?? '0.00'
        assertRecordable(
          checkRefund({ refundable: isCheckoutRefundable(row), paid: row.amount, refunded, amount }),
          amountOwed(row.amount, refunded)
        )
        const expected = expectedTotal(input.expectedRefunded, refunded)
        await assertRefundRefUnused(input.refundRef)

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
          })
        )

        paid = row.amount
        refundedTotal = next.refundedAmount
        garageName = row.garageName
        const fresh = await refundsRepository.findCheckout(row.intentId)
        item = fresh ? fromCheckout(fresh) : null
        break
      }

      case 'bill': {
        const row = await refundsRepository.findBill(input.id)
        if (!row) throw notFound()
        const booking = { status: row.bookingStatus, noShow: row.noShow }
        const refunded = row.refundedAmount ?? '0.00'
        assertRecordable(
          checkRefund({ refundable: isBillRefundable(row, booking), paid: row.amountDue, refunded, amount }),
          amountOwed(row.amountDue, refunded)
        )
        const expected = expectedTotal(input.expectedRefunded, refunded)
        await assertRefundRefUnused(input.refundRef)

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
            noteFor('the final bill payment', next.full)
          )
        )

        paid = row.amountDue
        refundedTotal = next.refundedAmount
        garageName = row.garageName
        const fresh = await refundsRepository.findBill(row.chargeId)
        item = fresh ? fromBill(fresh) : null
        break
      }
    }

    if (!item) throw notFound()

    log.info(
      { kind: input.kind, id: input.id, amount, refundedTotal, refundRef, outside: !refundRef, by },
      'refund:recorded'
    )
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
}
