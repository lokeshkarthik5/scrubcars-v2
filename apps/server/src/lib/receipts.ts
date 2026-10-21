/**
 * The customer's payment receipt for a booking, as a pure function of rows
 * the server already has.
 *
 * The owner's decision: "receipt now, GST later". This is a record of what
 * the customer paid Detlio and what came back, which they can save and share.
 * It is deliberately NOT a tax invoice — no GSTIN, no tax breakdown, no
 * "Tax invoice" wording — until the CA has confirmed how GST is set up. Adding
 * any of that here before then would put a tax claim in front of customers
 * that the business has not made.
 *
 * A receipt exists once a payment for the booking went through (paid,
 * collected, or since refunded). A cancelled booking and a customer no-show
 * still get one: the customer paid, and the refunds (or the lack of them) are
 * on it. A booking the customer moved to a new time does not: its payment
 * went with the move, and the receipt is on the new booking, under the same
 * receipt number (see formatReceiptSerial).
 *
 * Money is carried as decimal strings and added in paise, like the rest of
 * the API. Dates are shown in IST whatever the server's own timezone is, so
 * the date on a receipt is the date the customer saw on their phone.
 * Clock-free: nothing here reads the time.
 */
import { bookingReference } from './booking-ops.js'
import { isRazorpayRefundId } from './refunds.js'
import type { BookingType } from './booking-types.js'

/**
 * Who issues the receipt: Detlio, the platform the customer paid.
 *
 * Detlio is run by ScrubCars, a sole proprietorship, so `tradeName` is that
 * trade name and the receipt prints "Operated by ScrubCars". A
 * proprietorship's own legal name is the proprietor's; it is not needed on a
 * payment receipt and is deliberately not stored here. A GST tax invoice will
 * need the name and GSTIN exactly as on the GST registration: the CA's call.
 *
 * `address` is the business address, printed because the Consumer Protection
 * (General) Rules, 2020 (rule 5) expect a seller's name and address on a
 * receipt. It must stay the same as the address on the business's Razorpay
 * account and the website's contact page; change all three together.
 * `supportEmail` is the inbox the owner reads today (a Gmail address until
 * Detlio has its own). Either may be null, and the receipt then leaves that
 * line out.
 *
 * No GSTIN goes here until GST is set up: this is a payment receipt, not a
 * tax invoice.
 */
export const RECEIPT_ISSUER = {
  name: 'Detlio',
  // The business that runs Detlio (a sole proprietorship's trade name).
  tradeName: 'ScrubCars' as string | null,
  // The business address (see above), as the owner gave it.
  address:
    'No. 47, Radha Nagar Main Road, Chromepet, Chengalpattu, Tamil Nadu 600044' as string | null,
  // The same line as SUPPORT_PHONE_DISPLAY in packages/core/src/support.ts,
  // which the server cannot import. Change both together.
  supportPhone: '+91 93444 34474',
  // The support inbox for now; to move to a detlio.com address later.
  supportEmail: 'contact.scrubcars@gmail.com' as string | null,
  website: 'detlio.com',
}

/** A payment that went through: what makes a booking have a receipt. */
const SUCCEEDED: ReadonlySet<string> = new Set(['paid', 'collected', 'refunded'])

/**
 * How a refund line says the money went back. Each says only what is known,
 * because the customer is told to save and share this:
 *
 * - `razorpay`: the line has a Razorpay refund id, and Razorpay always
 *   refunds to the method the customer paid with.
 * - `direct`: ops recorded it with no Razorpay id, which means it went back
 *   outside Razorpay (UPI or a bank transfer). The team's note says how, but
 *   it is theirs, so the receipt names no route.
 * - `unknown`: an amount the row says went back that no record covers — a
 *   refund marked by hand before refunds were recorded. Nobody knows how.
 */
export const REFUND_METHODS = {
  razorpay: 'Refunded to original payment method',
  direct: 'Refunded directly by Detlio',
  unknown: 'Refunded',
} as const

// ─── Money ───────────────────────────────────────────────────────────────────

function toPaise(amount: string | number | null | undefined): number {
  const value = Number(amount ?? 0)
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}

function fromPaise(paise: number): string {
  return (paise / 100).toFixed(2)
}

// ─── Dates, in IST ───────────────────────────────────────────────────────────

/** IST is UTC+05:30 all year: India keeps no daylight saving. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Worked out by hand rather than with toLocaleString: what Intl prints for
// "en-IN" (am/pm, its case, the space before it) differs between Node and
// ICU versions, and a receipt has to read the same wherever it is rendered.
function istParts(date: Date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  }
}

/** "3 Oct 2026", the IST calendar date. */
export function istDateLabel(date: Date): string {
  const p = istParts(date)
  return `${p.day} ${MONTHS[p.month]} ${p.year}`
}

/** "3 Oct 2026, 9:05 AM IST". */
export function istDateTimeLabel(date: Date): string {
  const p = istParts(date)
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12
  const meridiem = p.hour < 12 ? 'AM' : 'PM'
  const minute = String(p.minute).padStart(2, '0')
  return `${istDateLabel(date)}, ${hour12}:${minute} ${meridiem} IST`
}

/** "Sat, 3 Oct 2026, 10:00 AM IST": the service slot, with its weekday. */
export function istSlotLabel(date: Date): string {
  return `${WEEKDAYS[istParts(date).weekday]}, ${istDateTimeLabel(date)}`
}

// ─── Receipt numbers ─────────────────────────────────────────────────────────

/**
 * The Indian financial year a moment falls in, as a receipt number writes
 * it: "26-27" is 1 April 2026 to 31 March 2027. Decided in IST, so a payment
 * at 00:10 on 1 April in Chennai (still 31 March in UTC) is in the new year,
 * as it is on the customer's phone.
 *
 * The same rule is in drizzle/0030_receipt_numbers.sql, which numbered the
 * receipts that already existed; change both together.
 */
export function financialYearOf(date: Date): string {
  const p = istParts(date)
  // January to March belong to the year that began the April before.
  const startYear = p.month >= 3 ? p.year : p.year - 1
  const yy = (year: number) => String(year % 100).padStart(2, '0')
  return `${yy(startYear)}-${yy(startYear + 1)}`
}

/** The highest serial a financial year can hold in six digits. */
export const RECEIPT_SERIAL_MAX = 999_999

/**
 * The receipt's number: "DTL/26-27/000123", the 123rd receipt of the
 * financial year 2026-27. Always 16 characters.
 *
 * The Consumer Protection (General) Rules, 2020 (rule 5(1)(b)) ask for a
 * consecutive serial number of at most sixteen characters, unique for a
 * financial year; GST invoices will need the same once Detlio registers. So
 * the serial counts up from 000001 each financial year with no gaps, and the
 * number is issued once, when the booking's own payment first goes through,
 * and stored (receipt_numbers, see allocateReceiptNumber): this only writes it
 * out. A seventh digit would make it 17 characters, so a serial past 999999
 * is refused rather than written.
 */
export function formatReceiptSerial(financialYear: string, seq: number): string {
  if (!/^\d{2}-\d{2}$/.test(financialYear)) {
    throw new Error(`Not a financial year: ${financialYear}`)
  }
  if (!Number.isInteger(seq) || seq < 1 || seq > RECEIPT_SERIAL_MAX) {
    throw new Error(`Receipt serial ${seq} is outside 1..${RECEIPT_SERIAL_MAX} for ${financialYear}`)
  }
  return `DTL/${financialYear}/${String(seq).padStart(6, '0')}`
}

/**
 * When a receipt was issued: when its payment first went through. A
 * reschedule copies paid_at onto the new booking's payment, so this is the
 * same moment on every booking of a chain, and it is what decides the
 * financial year the number belongs to. A payment that went through with no
 * paid_at (rows from before it was always written) falls back to when the
 * row was made.
 */
export function receiptIssuedAt(payment: { paidAt: Date | null; createdAt: Date }): Date {
  return payment.paidAt ?? payment.createdAt
}

/**
 * A customer's phone as the receipt shows it: "+91 ******4321". A receipt is
 * made to be shared, and the last four digits are enough for the customer to
 * recognise it as theirs.
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) return '+91 **********'
  return `+91 ******${digits.slice(-4)}`
}

// ─── Inputs ──────────────────────────────────────────────────────────────────

export interface ReceiptPayment {
  status: string
  amount: string
  /** The Razorpay payment id once paid ("pay_…"); the order id before. */
  gatewayTxnId: string | null
  paidAt: Date | null
  createdAt: Date
  refundedAmount?: string | null
  refundRef?: string | null
  refundedAt?: Date | null
}

export interface ReceiptBill {
  id: string
  kind: string
  status: string
  totalAmount: string
  paidBefore: string
  amountDue: string
  lines: Array<{ description: string; amount: string }>
  gatewayPaymentId: string | null
  paidAt: Date | null
  refundedAmount?: string | null
  refundRef?: string | null
  refundedAt?: Date | null
}

/** One row of refund_records, as much of it as the customer may see. */
export interface ReceiptRefundRecord {
  kind: 'booking' | 'checkout' | 'bill'
  targetId: string
  amount: string
  refundRef: string | null
  recordedAt: Date
  /**
   * Where Razorpay says it stands (0036): a refund the app sent that is
   * still 'pending' there has not reached the customer, so the receipt does
   * not show it as refunded yet. Failed ones are never passed in.
   */
  gatewayStatus?: 'pending' | 'processed' | 'failed' | null
}

export interface ReceiptBooking {
  id: string
  /** The first booking of its reschedule chain; null if it was never moved. */
  originalBookingId?: string | null
  status: string
  bookingType: BookingType
  scheduledAt: Date
  amount: string
  subtotalAmount?: string | null
  discountAmount?: string | null
  discountCode?: string | null
  paymentMethod: string
  noShow?: 'customer' | 'garage' | null
  user?: { name: string; phone: string } | null
  vendor?: { businessName: string; address: string; city: string } | null
  items?: Array<{ name: string; amount: string }> | null
  service?: { name: string } | null
  payment?: ReceiptPayment | null
  charges?: ReceiptBill[] | null
}

// ─── Availability ────────────────────────────────────────────────────────────

/**
 * Whether a booking has a receipt, and if not, why not:
 *
 * - `available`: its payment went through (paid, collected, or refunded since).
 * - `moved`: the customer moved it to a new time. A reschedule copies the
 *   payment, still 'paid', onto the new booking, so this one would be a second
 *   receipt for the same money.
 * - `unpaid`: no payment has gone through yet.
 */
export type ReceiptAvailability = 'available' | 'moved' | 'unpaid'

export function receiptAvailability(booking: {
  status: string
  moved: boolean
  payment?: { status: string } | null
}): ReceiptAvailability {
  // 'rescheduled' is the old way a moved booking was retired.
  if (booking.moved || booking.status === 'rescheduled') return 'moved'
  if (!booking.payment || !SUCCEEDED.has(booking.payment.status)) return 'unpaid'
  return 'available'
}

// ─── The receipt ─────────────────────────────────────────────────────────────

export interface ReceiptRefundLine {
  /** What was refunded: the booking's own payment, or the final bill's. */
  against: 'booking' | 'final_bill'
  amount: string
  refundedAt: string | null
  refundedAtLabel: string | null
  /** One of REFUND_METHODS: only as much about the route as is known. */
  method: string
  /** The Razorpay refund id, only when it is one ("rfnd_…"). */
  reference: string | null
}

export interface Receipt {
  /** "DTL/26-27/000123": issued once for the chain and stored (formatReceiptSerial). */
  receiptNumber: string
  /** When the first payment went through: the receipt's date. */
  issuedAt: string
  issuedOn: string
  issuer: typeof RECEIPT_ISSUER
  customer: { name: string; phone: string }
  garage: { name: string; address: string }
  booking: {
    id: string
    reference: string
    /** The first booking's reference when this one was moved here; else null. */
    originalReference: string | null
    bookingType: BookingType
    status: string
    statusLabel: string
    scheduledAt: string
    scheduledAtLabel: string
  }
  /** The services as sold: the names and prices on the booking. */
  items: Array<{ name: string; amount: string }>
  subtotal: string
  discount: { code: string | null; amount: string } | null
  bookingPayment: {
    amount: string
    method: string
    paymentId: string | null
    paidAt: string | null
    paidAtLabel: string | null
  }
  /** A paid final bill of an inspection job, as its own section. */
  finalBill: {
    lines: Array<{ description: string; amount: string }>
    total: string
    /**
     * The bill credits the booking's pre-discount price (paid_before). It is
     * split as the booking page's final-bill card splits it: what the
     * customer actually paid at booking, and the discount they keep. Showing
     * paid_before as one "covered" figure would put a larger number next to
     * the booking payment than the customer ever paid.
     */
    creditedFromBooking: string
    discount: { code: string | null; amount: string } | null
    balancePaid: string
    paymentId: string | null
    paidAt: string | null
    paidAtLabel: string | null
  } | null
  refunds: ReceiptRefundLine[]
  /** Everything paid: the booking and a paid final bill's balance. */
  totalPaid: string
  totalRefunded: string
  /** What the customer paid in the end: paid less refunded. */
  netPaid: string
}

/** The booking's state in a word or two, as the receipt states it. */
export function receiptStatusLabel(status: string, noShow?: 'customer' | 'garage' | null): string {
  if (status === 'cancelled') {
    if (noShow === 'customer') return 'No-show'
    if (noShow === 'garage') return 'Cancelled (garage no-show)'
    return 'Cancelled'
  }
  switch (status) {
    case 'pending':
      return 'Requested'
    case 'confirmed':
      return 'Confirmed'
    case 'in_progress':
      return 'In progress'
    case 'completed':
      return 'Completed'
    default:
      return 'Cancelled'
  }
}

/** A Razorpay payment id, and nothing else — never an order id. */
function paymentIdOf(value: string | null | undefined): string | null {
  return value && value.startsWith('pay_') ? value : null
}

/**
 * One target's refunds (the booking's payment, or a bill), as lines.
 *
 * refund_records holds every refund since 0029. The row's own refund
 * columns hold the running total, which also covers refunds marked before
 * 0029 (a payment set to 'refunded' with no amount meant all of it). When
 * the row says more went back than the records add up to, the difference is
 * one more line, dated by the row's latest refund — so the receipt never
 * shows less refunded than actually was.
 *
 * A refund still pending at Razorpay is left out, though the row's running
 * total counts it: the receipt says what was refunded, not what was started.
 * It appears once Razorpay processes it (and is gone for good if it fails).
 */
function refundLinesFor(
  against: ReceiptRefundLine['against'],
  records: ReceiptRefundRecord[],
  row: { refunded: string | null | undefined; refundRef?: string | null; refundedAt?: Date | null }
): ReceiptRefundLine[] {
  const line = (
    amount: number,
    at: Date | null | undefined,
    ref: string | null | undefined,
    // What the line is when it has no Razorpay id: a recorded refund done
    // outside Razorpay, or an uncovered amount nobody knows the route of.
    otherwise: 'direct' | 'unknown'
  ): ReceiptRefundLine => {
    // A refund done outside Razorpay has a null ref and a note saying how;
    // the note is the team's, so the customer sees no reference at all.
    const reference = ref && isRazorpayRefundId(ref) ? ref : null
    return {
      against,
      amount: fromPaise(amount),
      refundedAt: at?.toISOString() ?? null,
      refundedAtLabel: at ? istDateLabel(at) : null,
      method: REFUND_METHODS[reference ? 'razorpay' : otherwise],
      reference,
    }
  }

  const standing = records.filter((record) => record.gatewayStatus !== 'pending')

  const lines = standing
    .filter((record) => toPaise(record.amount) > 0)
    .map((record) =>
      line(
        toPaise(record.amount),
        record.recordedAt,
        record.refundRef,
        // Recording a refund takes either a rfnd_ id or a note on how it went
        // back outside Razorpay, so a record without an id is the latter.
        record.refundRef ? 'unknown' : 'direct'
      )
    )

  // Every record, pending ones too: the row's total includes them.
  const recorded = records.reduce((total, record) => total + toPaise(record.amount), 0)
  const missing = toPaise(row.refunded) - recorded
  if (missing > 0) {
    // With no records at all, the row's ref is this refund's own. With some,
    // the row's ref is the latest record's, already on its line.
    lines.push(
      line(missing, row.refundedAt, records.length === 0 ? row.refundRef : null, 'unknown')
    )
  }

  return lines
}

/**
 * The receipt for a booking whose payment went through. The caller checks
 * receiptAvailability first; this throws if there is no payment at all,
 * which would be a bug upstream rather than a customer's mistake.
 *
 * `refundRecords` are the booking's refund_records rows. Only refunds of the
 * booking's payment and of its paid final bill are on the receipt: a payment
 * that landed on a bill the garage had replaced paid for nothing on this
 * booking, so neither it nor its refund belongs in these totals.
 *
 * `receiptNumber` is the number stored for the booking's reschedule chain
 * (receipt_numbers, keyed by the chain's first booking). It is passed in, not
 * worked out here, because a consecutive number depends on every other
 * receipt issued that year; a final bill paid later is on this same receipt
 * under this same number.
 */
export function buildReceipt(
  booking: ReceiptBooking,
  refundRecords: ReceiptRefundRecord[],
  receiptNumber: string
): Receipt {
  const payment = booking.payment
  if (!payment) throw new Error(`Booking ${booking.id} has no payment to make a receipt from`)

  const firstPaidAt = receiptIssuedAt(payment)
  const subtotal = booking.subtotalAmount ?? booking.amount
  const discountPaise = toPaise(booking.discountAmount)
  const discountCode = booking.discountCode ?? null

  const items =
    booking.items && booking.items.length > 0
      ? booking.items.map((item) => ({ name: item.name, amount: fromPaise(toPaise(item.amount)) }))
      : // Bookings from before booking_items carry only their one service.
        booking.service
        ? [{ name: booking.service.name, amount: fromPaise(toPaise(subtotal)) }]
        : []

  // The bill that stands, and only once it is paid: an unpaid or
  // not-needed bill took no money.
  const bill =
    booking.charges?.find((charge) => charge.kind === 'final_bill' && charge.status === 'paid') ??
    null

  const paymentRefunds = refundLinesFor(
    'booking',
    refundRecords.filter((record) => record.kind === 'booking' && record.targetId === booking.id),
    {
      // A payment marked refunded before 0029 has no amount: all of it went back.
      refunded:
        payment.status === 'refunded'
          ? (payment.refundedAmount ?? payment.amount)
          : payment.refundedAmount,
      refundRef: payment.refundRef,
      refundedAt: payment.refundedAt,
    }
  )
  const billRefunds = bill
    ? refundLinesFor(
        'final_bill',
        refundRecords.filter((record) => record.kind === 'bill' && record.targetId === bill.id),
        { refunded: bill.refundedAmount, refundRef: bill.refundRef, refundedAt: bill.refundedAt }
      )
    : []
  const refunds = [...paymentRefunds, ...billRefunds].sort(
    (a, b) => (a.refundedAt ?? '').localeCompare(b.refundedAt ?? '')
  )

  // The bill's credit for the booking, split into paid and kept discount
  // exactly as FinalBillCard does, so the two never disagree.
  const billCredit = bill ? toPaise(bill.paidBefore) : 0
  const billDiscount = billCredit > 0 && discountPaise > 0 ? Math.min(discountPaise, billCredit) : 0

  const totalPaid = toPaise(payment.amount) + (bill ? toPaise(bill.amountDue) : 0)
  const totalRefunded = refunds.reduce((total, refund) => total + toPaise(refund.amount), 0)

  const vendor = booking.vendor
  const street = vendor?.address?.trim() ?? ''
  const city = vendor?.city?.trim() ?? ''
  // A garage's address usually names its city already; only add it when not.
  const garageAddress =
    street && city && !street.toLowerCase().includes(city.toLowerCase())
      ? `${street}, ${city}`
      : street || city

  return {
    receiptNumber,
    issuedAt: firstPaidAt.toISOString(),
    issuedOn: istDateLabel(firstPaidAt),
    issuer: { ...RECEIPT_ISSUER },
    customer: {
      name: booking.user?.name ?? '',
      phone: booking.user ? maskPhone(booking.user.phone) : '',
    },
    garage: { name: vendor?.businessName ?? '', address: garageAddress },
    booking: {
      id: booking.id,
      reference: bookingReference(booking.id),
      originalReference:
        booking.originalBookingId && booking.originalBookingId !== booking.id
          ? bookingReference(booking.originalBookingId)
          : null,
      bookingType: booking.bookingType,
      status: booking.status,
      statusLabel: receiptStatusLabel(booking.status, booking.noShow),
      scheduledAt: booking.scheduledAt.toISOString(),
      scheduledAtLabel: istSlotLabel(booking.scheduledAt),
    },
    items,
    subtotal: fromPaise(toPaise(subtotal)),
    discount:
      discountPaise > 0
        ? { code: discountCode, amount: fromPaise(discountPaise) }
        : null,
    bookingPayment: {
      amount: fromPaise(toPaise(payment.amount)),
      method: booking.paymentMethod === 'cash' ? 'Cash' : 'Online (Razorpay)',
      paymentId: paymentIdOf(payment.gatewayTxnId),
      paidAt: payment.paidAt?.toISOString() ?? null,
      paidAtLabel: payment.paidAt ? istDateTimeLabel(payment.paidAt) : null,
    },
    finalBill: bill
      ? {
          lines: bill.lines.map((line) => ({
            description: line.description,
            amount: fromPaise(toPaise(line.amount)),
          })),
          total: fromPaise(toPaise(bill.totalAmount)),
          creditedFromBooking: fromPaise(billCredit - billDiscount),
          discount:
            billDiscount > 0 ? { code: discountCode, amount: fromPaise(billDiscount) } : null,
          balancePaid: fromPaise(toPaise(bill.amountDue)),
          paymentId: paymentIdOf(bill.gatewayPaymentId),
          paidAt: bill.paidAt?.toISOString() ?? null,
          paidAtLabel: bill.paidAt ? istDateTimeLabel(bill.paidAt) : null,
        }
      : null,
    refunds,
    totalPaid: fromPaise(totalPaid),
    totalRefunded: fromPaise(totalRefunded),
    netPaid: fromPaise(Math.max(0, totalPaid - totalRefunded)),
  }
}
