/**
 * Starting the pilot clean: which test bookings, checkouts and receipt
 * numbers the admin "Start pilot clean" page deletes, which it keeps and why,
 * and what happens to the receipt numbering.
 *
 * The owner's words: "reset everything when I start the pilot & delete test
 * bookings, test refunds, everything so it is clean". The rules that make
 * that safe are decided here, once, so the dry run and the delete can never
 * disagree, and so each rule has a test that needs no database:
 *
 * - A booking is deleted with its whole reschedule chain or not at all. The
 *   chain is keyed by its first booking (original_booking_id ?? id), which is
 *   also what its receipt number hangs off; deleting half a chain would leave
 *   the other half pointing at nothing.
 * - Real money is never deleted. Each payment, final bill and paid checkout
 *   is classed by the Razorpay mode it was taken in (gateway_mode, or what
 *   Razorpay said when asked). Test and E2E money can go; live money, cash,
 *   and anything that could not be confirmed as test money keep the whole
 *   chain, greyed out with the reason. So does an unpaid order that may be
 *   live and could still be captured: deleting its booking would leave a
 *   late payment with nothing to land on.
 * - Receipt numbers are never renumbered (AGENTS.md). A financial year whose
 *   receipts all belong to deleted chains restarts at 000001; any other year
 *   keeps its counter and records the deleted numbers as void.
 * - A team test (0065): a chain marked Test that took real money may go only
 *   once every rupee taken on it was refunded (none still owed, no Razorpay
 *   refund still processing) and no garage payout covered it. Its payments
 *   are written to the deleted_test_payments ledger first, and its receipt
 *   number is always voided, never restarted. Never for a garage's delete.
 * - A chain and its free redo (Detlio Guarantee, 0051) go together: the redo
 *   is a booking of its own that answers the first one's claim.
 * - The owner deletes anything marked Test (10 Nov 2026): for the owner's
 *   login alone (`owner`), on one booking marked Test (scope `chains`) or a
 *   garage deleted forever (scope `garage`), real money, an order that may
 *   still be paid and a garage payout no longer keep a chain. Every real
 *   payment is written to the ledger first with whether it was refunded,
 *   credit spent goes back to the customer, and the owner types the
 *   reference. On one booking the payout stays on record with only that
 *   booking's line gone; a garage deleted forever takes its payouts with it,
 *   each line written to the ledger first.
 *
 * Pure and clock-free: the caller reads the rows, asks Razorpay, and passes
 * everything in. Node's crypto is used for the fingerprint, and nothing else
 * outside this file.
 */
import { createHash } from 'node:crypto'
import { bookingReference } from './booking-ops.js'
import { financialYearOf, formatReceiptSerial } from './receipts.js'

// ─── The switch ──────────────────────────────────────────────────────────────

/**
 * Whether the reset exists at all: ADMIN_DATA_RESET=on. Off by default, and
 * every one of its routes is then a 404 and the admin nav hides it. The owner
 * turns it on for the reset and off again afterwards.
 */
export function isDataResetEnabled(value: string | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'on'
}

/**
 * The most chains one run deletes, and the most checkouts. The database has a
 * single connection on Vercel, and every row is locked for the length of the
 * delete, so a run is kept short; past the cap the oldest are taken and the
 * rest wait for the next run.
 */
export const MAX_CHAINS_PER_RUN = 300
export const MAX_CHECKOUTS_PER_RUN = 1000

/**
 * The most ticked ids a request may name. Well above the per-run caps: more
 * ticked than a run takes is not an error, the planner takes the oldest up
 * to its cap and says how many wait (`overCap`). This only bounds the body.
 */
export const MAX_TICKED_IDS = 10_000

// ─── Inputs ──────────────────────────────────────────────────────────────────

export type GatewayModeValue = 'live' | 'test' | 'fake'

/** What Razorpay said about a payment or order id, when it was asked. */
export type RazorpayLookup = 'live' | 'test' | 'unknown'

/** A booking's own payment row, as much of it as the reset reads. */
export interface ResetPayment {
  status: string
  gatewayTxnId: string | null
  gatewayMode: GatewayModeValue | null
  amount: string
  /**
   * The part paid with Detlio credit (0049). Credit is real money a customer
   * paid for a gift (the reset never touches gifts or the credit ledger), so
   * a chain that spent any is always kept, whatever its Razorpay part was.
   */
  creditAmount?: string | null
  refundedAmount: string | null
  /** When it went through: for the team-test ledger (0065). */
  paidAt?: Date | null
  /** Its credit part already went back to the customer (credit_returned_at). */
  creditReturned?: boolean
}

/** One booking of a candidate chain, with its payment. */
export interface ResetBooking {
  id: string
  originalBookingId: string | null
  status: string
  paymentMethod: string
  createdAt: Date
  scheduledAt: Date
  /** When it was cancelled (a moved booking reads cancelled too). */
  cancelledAt: Date | null
  markedTestAt: Date | null
  amount: string
  vendorId: string
  garageName: string
  userId: string
  customerName: string
  /** For the owner to recognise a team phone in the list; never audited. */
  customerPhone?: string
  payment: ResetPayment | null
}

/** A final bill on a candidate booking. */
export interface ResetCharge {
  id: string
  bookingId: string
  status: string
  amountDue: string
  gatewayOrderId: string | null
  gatewayPaymentId: string | null
  gatewayMode: GatewayModeValue | null
  refundedAmount: string | null
  /** Moved with the bill's status and its order: when it was last payable, once withdrawn. */
  updatedAt: Date
  /** A final bill or extra work (0041); absent reads as a final bill. */
  kind?: 'final_bill' | 'extra_work'
  paidAt?: Date | null
}

/**
 * A refund recorded on a candidate chain's payment or bill (refund_records,
 * kind booking or bill), for the team-test rule (0065): whether a Razorpay
 * refund is still processing, and what the ledger keeps.
 */
export interface ResetRefund {
  kind: 'booking' | 'bill'
  /** The booking (for its payment) or the bill the refund is on. */
  targetId: string
  amount: string
  refundRef: string | null
  source: string
  gatewayStatus: 'pending' | 'processed' | 'failed' | null
  recordedBy: string
  recordedAt: Date
}

/**
 * A free redo (Detlio Guarantee, 0051): the claim on `bookingId` was answered
 * by the ₹0 booking `redoBookingId`, a chain of its own. The two go together.
 */
export interface ResetRedoLink {
  bookingId: string
  redoBookingId: string
}

/**
 * A checkout (booking intent): one a candidate booking was made from, or one
 * that never became a booking at all.
 */
export interface ResetIntent {
  id: string
  bookingId: string | null
  status: string
  createdAt: Date
  /** An unpaid checkout past this is dead; before it, it can still be paid. */
  expiresAt: Date
  amount: string
  gatewayTxnId: string | null
  paymentRef: string | null
  gatewayMode: GatewayModeValue | null
  refundedAmount: string | null
  userId: string
  customerName: string
  garageName: string
}

/** A receipt number, as receipt_numbers holds it. */
export interface ResetReceipt {
  rootBookingId: string
  financialYear: string
  seq: number
  number: string
  issuedAt: Date
}

/**
 * A customer complaint (0035). Complaints point at bookings only loosely
 * (ON DELETE SET NULL), so they are not part of any chain: a cutoff run
 * takes the ones made before the cutoff as a group of their own, with one
 * tick for all of them. Deleting one test booking (scope `chains`) takes
 * the complaints about it with it (0064): they are about a booking that
 * never was.
 */
export interface ResetComplaint {
  id: string
  /** The sequence number, printed C-000123. */
  number: number
  createdAt: Date
  /** The booking it is about, when the read says (scope `chains`). */
  bookingId?: string | null
}

/**
 * A garage payout (0038) that paid a candidate chain, with every chain it
 * paid. Paid-out money only goes with all of it: a payout is deleted only
 * together with every booking it paid, and keeps them all otherwise
 * (its items name their bookings ON DELETE RESTRICT).
 */
export interface ResetPayout {
  id: string
  /** When the team recorded it. */
  recordedAt: Date
  /** The first booking of every chain it paid (vendor_payout_items.booking_id). */
  rootBookingIds: string[]
  /**
   * What it paid on each of those chains, when it was sent and its
   * reference: what the ledger says when the owner deletes a booking it
   * paid and the payout stays (10 Nov 2026). Absent reads as unknown.
   */
  items?: Array<{ rootBookingId: string; amount: string }>
  paidAt?: Date
  reference?: string
  /**
   * What it paid in all: what the ledger says when the owner's Delete
   * forever removes it with the garage (10 Nov 2026). Absent reads as unknown.
   */
  amount?: string
}

/** The rows that hang off one booking and go with it (ON DELETE CASCADE). */
export interface BookingChildCounts {
  items: number
  notes: number
  photos: number
  reviews: number
  promoUses: number
  /** refund_records of kind booking or bill. */
  refundRecords: number
  /** "Did the garage ask you to book directly?" reports about it (0052, 0065). */
  bypassReports?: number
  /** Visit requests it was booked from (customer reach, 0062; 0065). */
  requests?: number
}

/** The rows that hang off one checkout and go with it. */
export interface IntentChildCounts {
  items: number
  /** refund_records of kind checkout (no foreign key: deleted by hand). */
  refundRecords: number
}

/**
 * Which chains the run is about.
 *
 * - `before_cutoff`: every chain whose first booking was made before the
 *   cutoff, and every checkout opened before it that never became a booking.
 * - `marked_test`: every chain ops marked "Test".
 * - `chains`: the chains of these bookings (any booking of a chain names it),
 *   for deleting one test booking from its page. They must be marked "Test".
 * - `garage`: every chain and every checkout of one garage, whenever made,
 *   for deleting a garage forever from the admin Bin (modules/vendor-bin).
 *   Marked or not: the garage is going, so only money keeps a row.
 */
export type ResetScope =
  | { kind: 'before_cutoff'; cutoff: Date }
  | { kind: 'marked_test' }
  | { kind: 'chains'; bookingIds: string[] }
  | { kind: 'garage'; vendorId: string }

export interface PlanInput {
  /** The time the plan is made at: only an open checkout depends on it. */
  now: Date
  scope: ResetScope
  /**
   * The ticked rows, once the owner has reviewed the list: only these are
   * deleted (each still has to be in scope and deletable), the oldest up to
   * the run's cap. Absent on the first look, when every deletable row in
   * scope is ticked. Either way every row in scope is in the plan, ticked
   * or not, so the dry run and its list say what happens to each.
   */
  only?: { chainIds: string[]; checkoutIds: string[]; complaints?: boolean; analytics?: boolean } | null
  /** Every booking of every candidate chain, whole chains. */
  bookings: ResetBooking[]
  charges: ResetCharge[]
  /**
   * Checkouts of candidate bookings (consumed), and checkouts with no booking
   * that the scope may take (before_cutoff: opened before the cutoff, at any
   * garage; garage: every one at that garage, as the caller reads them).
   */
  intents: ResetIntent[]
  bookingChildCounts: Map<string, BookingChildCounts>
  /** booking_reschedules rows by chain (their original_booking_id). */
  reschedulesByChain: Map<string, number>
  intentChildCounts: Map<string, IntentChildCounts>
  /**
   * Complaints a cutoff run may take: those made before the cutoff. Ticked
   * as one: on the first look (no `only`) they are, and after that only
   * when `only.complaints` says so. For scope `chains`, the complaints about
   * the chains' bookings, taken with a chain that is deleted and kept with
   * one that is not. Absent (other scopes) is none.
   */
  complaints?: ResetComplaint[]
  /**
   * How many usage events (0040) were recorded before the cutoff: a cutoff
   * run's, as one row with one tick, like complaints (`only.analytics`).
   * Anonymous and tied to nothing, so they are counted, not listed. Absent
   * (other scopes) is none.
   */
  analyticsEvents?: number
  /**
   * Garage payouts that paid any candidate chain, each with every chain it
   * paid (some may be outside the scope). Absent is none.
   */
  payouts?: ResetPayout[]
  /**
   * Refunds recorded on the candidate chains' payments and bills (0065), for
   * the team-test rule. Absent is none.
   */
  refunds?: ResetRefund[]
  /** Free redos among the candidate chains' bookings (0065). Absent is none. */
  redoLinks?: ResetRedoLink[]
  /**
   * The owner's own delete (10 Nov 2026): only for scope `chains` (a
   * booking marked Test) and `garage` (Delete forever). Real money, an order
   * that may still be paid and a garage payout then no longer keep a chain;
   * see `ownerLines`. Absent or false: the rules every other admin has.
   */
  owner?: boolean
  /** The receipt numbers of the candidate chains. */
  receipts: ResetReceipt[]
  /**
   * Every receipt number in the financial years those receipts are in, to
   * tell which years have receipts the run keeps.
   */
  yearReceipts: Array<{ financialYear: string; rootBookingId: string }>
  /**
   * Chains whose receipt is available but has no number yet (a payment path
   * that missed it). The receipt page numbers them when first opened, so a
   * kept one counts as a real receipt in its year.
   */
  unnumberedReceipts: Array<{ rootBookingId: string; issuedAt: Date }>
  /** receipt_counters.last_seq by financial year. */
  counters: Map<string, number>
  /** receipt_number_voids rows by financial year. */
  voidsByYear: Map<string, number>
  /** What Razorpay said about ids whose gateway_mode is null, so far. */
  lookups: Map<string, RazorpayLookup>
  /**
   * When Razorpay cannot be asked at all (E2E's fake payments, no keys): an
   * id nobody has asked about is then unknown rather than waiting its turn.
   */
  lookupsUnavailable: boolean
}

// ─── Money ───────────────────────────────────────────────────────────────────

/**
 * What money a chain or checkout carries, from the most to the least serious:
 *
 * - `live`: Razorpay took real money (gateway_mode, or Razorpay said so).
 * - `cash`: paid in cash, on a booking from before checkout went online-only.
 * - `unknown`: money was taken and nobody can say it was a test payment.
 * - `unchecked`: money was taken on a row from before gateway_mode, and
 *   Razorpay has not been asked yet.
 * - `test`: Razorpay test mode.
 * - `fake`: an E2E order the server minted itself.
 * - `no_money`: nothing was ever taken.
 *
 * The first four keep the chain. Only the last three can be deleted.
 */
export type MoneyClass = 'live' | 'cash' | 'unknown' | 'unchecked' | 'test' | 'fake' | 'no_money'

const SEVERITY: Record<MoneyClass, number> = {
  live: 6,
  cash: 5,
  unknown: 4,
  unchecked: 3,
  test: 2,
  fake: 1,
  no_money: 0,
}

export function isDeletableMoney(money: MoneyClass): boolean {
  return money === 'test' || money === 'fake' || money === 'no_money'
}

/** A payment that went through, as receipts count it. */
const MONEY_TAKEN: ReadonlySet<string> = new Set(['paid', 'refunded', 'collected'])

/**
 * Ids lib/razorpay.ts mints under E2E_FAKE_PAYMENTS (order_e2e_…) and the
 * stubbed checkout sheet answers with (pay_e2e_…). A real Razorpay id is
 * letters and digits after its prefix, never an underscore, so these can
 * never be one.
 */
export function isFakeGatewayId(id: string): boolean {
  return id.startsWith('order_e2e_') || id.startsWith('pay_e2e_')
}

/** One place money landed, for classing. */
interface MoneyItem {
  /** The Razorpay id to ask about, when there is one. */
  gatewayId: string | null
  gatewayMode: GatewayModeValue | null
  cash: boolean
}

function classOf(item: MoneyItem, input: Pick<PlanInput, 'lookups' | 'lookupsUnavailable'>): MoneyClass {
  if (item.cash) return 'cash'
  if (item.gatewayMode === 'live') return 'live'
  if (item.gatewayMode === 'test') return 'test'
  if (item.gatewayMode === 'fake') return 'fake'
  // Money taken with no id to look up: nobody can say what it was.
  if (!item.gatewayId) return 'unknown'
  if (isFakeGatewayId(item.gatewayId)) return 'fake'
  const said = input.lookups.get(item.gatewayId)
  if (said) return said
  return input.lookupsUnavailable ? 'unknown' : 'unchecked'
}

function worst(classes: MoneyClass[]): MoneyClass {
  return classes.reduce<MoneyClass>(
    (acc, next) => (SEVERITY[next] > SEVERITY[acc] ? next : acc),
    'no_money'
  )
}

/** ₹0 through Razorpay, ₹0 of credit and no gateway id: no money moved. */
export function isZeroPayment(payment: { amount?: string | null; creditAmount?: string | null; gatewayTxnId: string | null }): boolean {
  return !payment.gatewayTxnId && Number(payment.amount ?? 0) === 0 && Number(payment.creditAmount ?? 0) === 0
}

/** Where money landed on a chain: its payments and its paid bills. */
function chainMoneyItems(bookings: ResetBooking[], charges: ResetCharge[]): MoneyItem[] {
  const items: MoneyItem[] = []
  for (const booking of bookings) {
    const payment = booking.payment
    if (!payment || !MONEY_TAKEN.has(payment.status)) continue
    // Nothing at all was taken: a free redo (Detlio Guarantee, 0051) is
    // written paid at ₹0 with no Razorpay id and no credit, so there is no
    // money to keep it for.
    if (isZeroPayment(payment)) continue
    items.push({
      gatewayId: payment.gatewayTxnId,
      gatewayMode: payment.gatewayMode,
      cash: booking.paymentMethod === 'cash' || payment.status === 'collected',
    })
    // Paid partly or wholly with Detlio credit: money nobody can prove was a
    // test, so 'unknown' (kept), with nothing to ask Razorpay about.
    if (Number(payment.creditAmount ?? 0) > 0) {
      items.push({ gatewayId: null, gatewayMode: null, cash: false })
    }
  }
  for (const charge of charges) {
    // A bill only carries money once a payment landed on it, even one that
    // landed on a bill since replaced or withdrawn.
    if (charge.status !== 'paid' && !charge.gatewayPaymentId) continue
    items.push({
      gatewayId: charge.gatewayPaymentId ?? charge.gatewayOrderId,
      gatewayMode: charge.gatewayMode,
      cash: false,
    })
  }
  return items
}

/**
 * Where money landed on a checkout with no booking: a failed one whose
 * payment was captured (payment_ref), or a consumed one whose booking has
 * since gone. A pending checkout was never paid.
 */
function checkoutMoneyItems(intent: ResetIntent): MoneyItem[] {
  if (intent.status === 'failed' && intent.paymentRef) {
    return [{ gatewayId: intent.paymentRef, gatewayMode: intent.gatewayMode, cash: false }]
  }
  if (intent.status === 'consumed') {
    return [{ gatewayId: intent.gatewayTxnId, gatewayMode: intent.gatewayMode, cash: false }]
  }
  return []
}

// ─── Orders that could still be paid ─────────────────────────────────────────
//
// An unpaid row is not always dead money. A Razorpay order stays payable after
// the sheet closes: a UPI collect request or a bank's late confirmation can
// be captured hours later. If its booking or checkout has been deleted by
// then, the webhook finds nothing to record the payment against, no refund is
// ever owed on any list, and nobody is told. So an unpaid order that may be
// live keeps its chain or checkout until it is clearly dead: a grace period
// after the last moment it could have been paid.

/** How long after an order could last be paid that a capture can still land. */
export const OPEN_ORDER_GRACE_MS = 24 * 60 * 60 * 1000

/** A Razorpay order nothing has been paid on yet. */
interface OpenOrder {
  gatewayId: string
  gatewayMode: GatewayModeValue | null
  /**
   * The last moment it could be paid; null while it still can be (the
   * booking is on and the customer can open its payment again).
   */
  closedAt: Date | null
}

/** Statuses where a booking is over and its payment can't be opened again. */
const BOOKING_CLOSED: ReadonlySet<string> = new Set(['cancelled', 'rescheduled'])

/**
 * Unpaid orders on a chain: a booking payment that never went through (pay
 * later, or a failed attempt that can be retried), and a final bill whose
 * order has no payment on it.
 */
function chainOpenOrders(bookings: ResetBooking[], charges: ResetCharge[]): OpenOrder[] {
  const orders: OpenOrder[] = []
  for (const booking of bookings) {
    const payment = booking.payment
    if (!payment?.gatewayTxnId || MONEY_TAKEN.has(payment.status)) continue
    if (booking.paymentMethod === 'cash') continue
    orders.push({
      gatewayId: payment.gatewayTxnId,
      gatewayMode: payment.gatewayMode,
      // createOrder refuses only a cancelled booking, so anything else can
      // still be paid for.
      closedAt: BOOKING_CLOSED.has(booking.status) ? (booking.cancelledAt ?? booking.createdAt) : null,
    })
  }
  for (const charge of charges) {
    if (!charge.gatewayOrderId || charge.gatewayPaymentId || charge.status === 'paid') continue
    orders.push({
      gatewayId: charge.gatewayOrderId,
      gatewayMode: charge.gatewayMode,
      // A due bill can be paid at any time; a withdrawn or replaced one
      // stopped being payable when its status moved.
      closedAt: charge.status === 'due' ? null : charge.updatedAt,
    })
  }
  return orders
}

/**
 * An unpaid checkout's order: a pending one, or a failed one with no
 * payment captured. Its sheet stops taking payments when it expires.
 */
function checkoutOpenOrders(intent: ResetIntent): OpenOrder[] {
  if (!intent.gatewayTxnId) return []
  const unpaid = intent.status === 'pending' || (intent.status === 'failed' && !intent.paymentRef)
  if (!unpaid) return []
  return [{ gatewayId: intent.gatewayTxnId, gatewayMode: intent.gatewayMode, closedAt: intent.expiresAt }]
}

/** Inside the grace period, or still payable. */
function mayStillBePaid(order: OpenOrder, now: Date): boolean {
  return order.closedAt === null || now.getTime() < order.closedAt.getTime() + OPEN_ORDER_GRACE_MS
}

/**
 * Whether a late capture on this order could be real money: a live order,
 * or one from before gateway_mode that Razorpay has not said was a test.
 * Test and E2E orders can only ever be test money.
 */
function mayBeLive(order: OpenOrder, lookups: Map<string, RazorpayLookup>): boolean {
  if (order.gatewayMode === 'test' || order.gatewayMode === 'fake') return false
  if (isFakeGatewayId(order.gatewayId)) return false
  if (order.gatewayMode === 'live') return true
  return lookups.get(order.gatewayId) !== 'test'
}

function hasOpenOrder(orders: OpenOrder[], input: Pick<PlanInput, 'now' | 'lookups'>): boolean {
  return orders.some((order) => mayStillBePaid(order, input.now) && mayBeLive(order, input.lookups))
}

/**
 * The Razorpay ids still to ask about: money on a candidate whose
 * gateway_mode is null, or an unpaid order with none that could still be
 * paid, that is not an E2E id and has not been answered. Sorted, so a run
 * that pages through them picks up where it stopped.
 */
export function idsToLookUp(
  input: Pick<PlanInput, 'now' | 'bookings' | 'charges' | 'intents' | 'lookups'>
): string[] {
  const orphans = input.intents.filter((intent) => intent.bookingId === null)
  const items = [
    ...chainMoneyItems(input.bookings, input.charges),
    ...orphans.flatMap(checkoutMoneyItems),
  ]
  const ids = new Set<string>()
  for (const item of items) {
    if (item.cash || item.gatewayMode || !item.gatewayId) continue
    if (isFakeGatewayId(item.gatewayId) || input.lookups.has(item.gatewayId)) continue
    ids.add(item.gatewayId)
  }
  const orders = [
    ...chainOpenOrders(input.bookings, input.charges),
    ...orphans.flatMap(checkoutOpenOrders),
  ]
  for (const order of orders) {
    if (order.gatewayMode || isFakeGatewayId(order.gatewayId)) continue
    if (input.lookups.has(order.gatewayId) || !mayStillBePaid(order, input.now)) continue
    ids.add(order.gatewayId)
  }
  return [...ids].sort()
}

// ─── Team tests: real money, all refunded (0065) ─────────────────────────────
//
// The team pays for test bookings with real money now and then (₹2 to check
// the live keys, a ₹299 wash the owner booked himself). Such a chain, marked
// Test, may go once every rupee taken on it was refunded: refunded on the
// money row (Refund now, Mark refunded or the automatic mode) with no
// Razorpay refund still processing. Its payments go to the ledger first.
// Cash, Detlio credit, a payment with no Razorpay id and one Razorpay was
// never asked about keep the chain as before: nothing can show those were
// all given back.

/** One real payment of a team test, as the ledger (deleted_test_payments) keeps it. */
export interface TeamTestPayment {
  rootId: string
  reference: string
  bookingIds: string[]
  /** A payment, or (the owner's delete, 10 Nov 2026) a garage payout's line on the chain. */
  kind: 'booking' | 'final_bill' | 'extra_work' | 'payout'
  chargeId: string | null
  razorpayPaymentId: string | null
  razorpayOrderId: string | null
  gatewayMode: GatewayModeValue | null
  amount: string
  refundedAmount: string
  refunds: Array<{
    refundRef: string | null
    amount: string
    source: string
    gatewayStatus: string | null
    recordedBy: string
    recordedAt: string
  }>
  receiptNumber: string | null
  vendorId: string
  garageName: string
  customerId: string
  paidAt: Date | null
  bookedAt: Date
  /**
   * Where the money stands (10 Nov 2026): every rupee refunded (the only
   * state before the owner's delete), not refunded, a Razorpay refund still
   * processing, paid with Detlio credit alone (given back), or paid out to
   * the garage (kind `payout`).
   */
  state: LedgerState
  /** "Paid out to Speed Wash on 3 Nov 2026 (UTR123)"; null when there is nothing to add. */
  note: string | null
  /** Detlio credit spent on it, which is back with the customer (now or earlier), in rupees. */
  creditReturned: string
  /** The payout the line was on (kind `payout`); no FK: it may go with its garage. */
  vendorPayoutId: string | null
}

export type LedgerState = 'refunded' | 'not_refunded' | 'refund_pending' | 'credit_returned' | 'paid_out'

/** One place money landed on a chain, with what was refunded on it. */
interface ChainMoney {
  kind: TeamTestPayment['kind']
  /** The booking (payment) or bill (charge) ids its refunds are recorded on. */
  targetIds: string[]
  chargeId: string | null
  gatewayId: string | null
  gatewayMode: GatewayModeValue | null
  money: MoneyClass
  cash: boolean
  credit: boolean
  /** The credit part, and whether it already went back to the customer. */
  creditPaise: number
  creditReturned: boolean
  amountPaise: number
  refundedPaise: number
  /** Standing refunds (a failed one moved no money). */
  refunds: ResetRefund[]
  paidAt: Date | null
}

/**
 * Every place money landed on a chain, one per Razorpay payment: a
 * reschedule copies the payment row, so the copies are one payment, whose
 * refunds are recorded on the row that was not moved (the most refunded).
 */
function chainMoney(
  rows: ResetBooking[],
  charges: ResetCharge[],
  refunds: ResetRefund[],
  input: Pick<PlanInput, 'lookups' | 'lookupsUnavailable'>
): ChainMoney[] {
  const standing = refunds.filter((refund) => refund.gatewayStatus !== 'failed')
  const out: ChainMoney[] = []
  const payments = groupBy(
    rows.filter((b) => b.payment && MONEY_TAKEN.has(b.payment.status) && !isZeroPayment(b.payment)),
    (b) => b.payment!.gatewayTxnId ?? `booking:${b.id}`
  )
  for (const group of payments.values()) {
    const first = group[0].payment!
    const cash = group.some((b) => b.paymentMethod === 'cash' || b.payment!.status === 'collected')
    const gatewayMode = group.map((b) => b.payment!.gatewayMode).find((mode) => mode !== null) ?? null
    const ids = new Set(group.map((b) => b.id))
    out.push({
      kind: 'booking',
      targetIds: [...ids],
      chargeId: null,
      gatewayId: first.gatewayTxnId,
      gatewayMode,
      money: classOf({ gatewayId: first.gatewayTxnId, gatewayMode, cash }, input),
      cash,
      credit: group.some((b) => Number(b.payment!.creditAmount ?? 0) > 0),
      creditPaise: Math.max(...group.map((b) => toPaise(b.payment!.creditAmount))),
      creditReturned: group.some((b) => b.payment!.creditReturned === true),
      amountPaise: toPaise(first.amount),
      refundedPaise: Math.max(...group.map((b) => toPaise(b.payment!.refundedAmount))),
      refunds: standing.filter((refund) => refund.kind === 'booking' && ids.has(refund.targetId)),
      paidAt: group.map((b) => b.payment!.paidAt ?? null).find((at) => at !== null) ?? null,
    })
  }
  for (const charge of charges) {
    if (charge.status !== 'paid' && !charge.gatewayPaymentId) continue
    const gatewayId = charge.gatewayPaymentId ?? charge.gatewayOrderId
    out.push({
      kind: charge.kind ?? 'final_bill',
      targetIds: [charge.id],
      chargeId: charge.id,
      gatewayId,
      gatewayMode: charge.gatewayMode,
      money: classOf({ gatewayId, gatewayMode: charge.gatewayMode, cash: false }, input),
      cash: false,
      credit: false,
      creditPaise: 0,
      creditReturned: false,
      amountPaise: toPaise(charge.amountDue),
      refundedPaise: toPaise(charge.refundedAmount),
      refunds: standing.filter((refund) => refund.kind === 'bill' && refund.targetId === charge.id),
      paidAt: charge.paidAt ?? null,
    })
  }
  return out
}

/** "₹299", "₹2.50", "₹1,299". */
export function rupeesFromPaise(paise: number): string {
  const whole = paise % 100 === 0
  return `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

export type TeamTestVerdict =
  | { deletable: true }
  | { deletable: false; kept: KeptReason; detail: string | null }

/**
 * Whether a Test-marked chain's real money lets it go as a team test, or
 * why not. Null when it took no real money (the ordinary rules decide).
 */
export function teamTestVerdict(money: ChainMoney[]): TeamTestVerdict | null {
  const real = money.filter((item) => !isDeletableMoney(item.money))
  if (real.length === 0) return null
  // What no refund record can account for: cash the garage took, credit
  // that goes back as credit, money with no Razorpay id. Kept as before.
  if (real.some((item) => item.credit)) return { deletable: false, kept: 'unknown', detail: null }
  if (real.some((item) => item.cash)) return { deletable: false, kept: 'cash', detail: null }
  if (real.some((item) => item.money === 'unchecked')) return { deletable: false, kept: 'unchecked', detail: null }
  if (real.some((item) => !item.gatewayId)) return { deletable: false, kept: 'unknown', detail: null }

  const owed = real.reduce((sum, item) => sum + Math.max(0, item.amountPaise - item.refundedPaise), 0)
  if (owed > 0) {
    return {
      deletable: false,
      kept: 'refund_first',
      detail: `Refund ${rupeesFromPaise(owed)} first. ${KEPT_REASONS.refund_first.detail}`,
    }
  }
  const pending = real
    .flatMap((item) => item.refunds)
    .filter((refund) => refund.gatewayStatus === 'pending')
    .reduce((sum, refund) => sum + toPaise(refund.amount), 0)
  if (pending > 0) {
    return {
      deletable: false,
      kept: 'refund_pending',
      detail: `Razorpay hasn't finished the refund of ${rupeesFromPaise(pending)} yet. Delete it once the refund is processed.`,
    }
  }
  return { deletable: true }
}

// ─── The owner deletes anything marked Test (10 Nov 2026) ────────────────────
//
// The owner's words: "as a owner I should be able to even mark real bookings
// as test & delete them as we will be doing a couple of tests end to end
// fully with accepting & everything". So for the owner alone, a booking
// marked Test goes whatever its money: the delete never refunds anything
// (that stays a deliberate act in Razorpay), so the dry run says plainly
// what was paid and not given back, and every payment is written to the
// ledger first with where it stands. Credit spent on it goes back to the
// customer's balance. A garage payout stays on record (the money really
// moved); only the booking's line on it goes, and the ledger says so. A
// garage deleted forever by the owner takes its payouts too ("an owner of
// the admin panel can clear or delete anything"), each line written to the
// ledger first with the payout's date, reference and total.

/** Booking statuses where it is still on: waiting, accepted or being worked on. */
const STILL_ON: ReadonlySet<string> = new Set(['pending', 'confirmed', 'in_progress'])

export const STILL_ON_LINE =
  'This booking is still on. Deleting it removes it for the customer and the garage without telling them.'

/** Where one real payment stands, for its ledger row. */
export function ledgerStateOf(
  item: Pick<ChainMoney, 'amountPaise' | 'refundedPaise' | 'refunds' | 'creditPaise' | 'cash' | 'money'>
): LedgerState {
  // Paid with credit alone: nothing went through Razorpay, and the credit
  // goes back with the delete. Credit beside a Razorpay test-mode (or
  // E2E-minted) payment is the same: the Razorpay part never moved, so the
  // only real money is the credit, and it goes back too. Counting it as not
  // refunded would overstate what the money record exists to account for.
  if (item.creditPaise > 0 && (item.amountPaise === 0 || isDeletableMoney(item.money))) return 'credit_returned'
  if (item.cash || item.refundedPaise < item.amountPaise) return 'not_refunded'
  if (item.refunds.some((refund) => refund.gatewayStatus === 'pending')) return 'refund_pending'
  return 'refunded'
}

/** "3 Nov 2026", the day in Chennai. */
export function istDay(at: Date): string {
  return at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
}

/** The ledger's line for a payout that stays: "Paid out to Speed Wash on 3 Nov 2026 (UTR123)". */
export function paidOutNote(garageName: string, payout: Pick<ResetPayout, 'paidAt' | 'reference' | 'recordedAt'>): string {
  const day = istDay(payout.paidAt ?? payout.recordedAt)
  return `Paid out to ${garageName} on ${day}${payout.reference ? ` (${payout.reference})` : ''}`
}

/**
 * The ledger's line for a payout deleted with its garage (the owner's Delete
 * forever, 10 Nov 2026): "Paid out to Speed Wash on 3 Nov 2026 (UTR123);
 * payout of ₹800 deleted with the garage". At most 300 characters, as the
 * column holds: a long garage name gives way, never the reference.
 */
export function removedPayoutNote(
  garageName: string,
  payout: Pick<ResetPayout, 'paidAt' | 'reference' | 'recordedAt' | 'amount'>
): string {
  const total = payout.amount ? ` of ${rupeesFromPaise(toPaise(payout.amount))}` : ''
  const tail = `; payout${total} deleted with the garage`
  const note = `${paidOutNote(garageName, payout)}${tail}`
  if (note.length <= 300) return note
  const name = `${garageName.slice(0, garageName.length - (note.length - 300) - 1)}…`
  return `${paidOutNote(name, payout)}${tail}`
}

/**
 * What the owner's dry run says about one chain, a line each, in the order
 * the owner needs them: that it is still on, each real payment not given
 * back with its amount and Razorpay id, a refund still processing, the
 * credit that goes back, an order that may still be paid, and each payout
 * that stays. Pure words over what the planner already worked out.
 */
export function ownerLinesFor(input: {
  stillOn: boolean
  money: ChainMoney[]
  openOrderIds: string[]
  /** `removed`: it goes with the garage (the owner's Delete forever) instead of staying. */
  payouts: Array<{ payout: ResetPayout; amount: string | null; removed?: boolean }>
  garageName: string
}): string[] {
  const lines: string[] = []
  if (input.stillOn) lines.push(STILL_ON_LINE)
  for (const item of input.money) {
    if (isDeletableMoney(item.money) && item.creditPaise === 0) continue
    if (item.cash) {
      lines.push(`${rupeesFromPaise(item.amountPaise)} was paid in cash to the garage. Deleting doesn't give it back.`)
      continue
    }
    const owed = Math.max(0, item.amountPaise - item.refundedPaise)
    const id = item.gatewayId ? `Razorpay ${item.gatewayId}` : 'no Razorpay id'
    if (owed > 0 && !isDeletableMoney(item.money)) {
      const paid = rupeesFromPaise(item.amountPaise)
      lines.push(
        owed === item.amountPaise
          ? `${paid} was really paid and has not been refunded (${id}). Deleting doesn't refund it — refund it in Razorpay first if the money should go back.`
          : `${paid} was really paid and ${rupeesFromPaise(owed)} of it has not been refunded (${id}). Deleting doesn't refund it — refund it in Razorpay first if the money should go back.`
      )
    }
    const pending = item.refunds
      .filter((refund) => refund.gatewayStatus === 'pending')
      .reduce((sum, refund) => sum + toPaise(refund.amount), 0)
    if (pending > 0 && !isDeletableMoney(item.money)) {
      lines.push(
        `Razorpay is still processing a refund of ${rupeesFromPaise(pending)} (${id}). It carries on, and the money record keeps it.`
      )
    }
    if (item.creditPaise > 0 && !item.creditReturned) {
      lines.push(
        `${rupeesFromPaise(item.creditPaise)} of Detlio credit was spent on it. It goes back to the customer's credit balance.`
      )
    }
  }
  for (const id of input.openOrderIds) {
    lines.push(`A Razorpay order (${id}) may still be paid. If it is, the payment will have no booking: refund it in Razorpay.`)
  }
  for (const { payout, amount, removed } of input.payouts) {
    const figure = amount ? `, ${rupeesFromPaise(toPaise(amount))}` : ''
    lines.push(
      removed
        ? `${paidOutNote(input.garageName, payout)}${figure}. The payout is deleted with the garage; the money record keeps it.`
        : `${paidOutNote(input.garageName, payout)}${figure}. The payout stays on record; only this booking's line on it goes.`
    )
  }
  return lines
}

// ─── Why a row is kept ───────────────────────────────────────────────────────

export type KeptReason =
  | 'live'
  | 'cash'
  | 'unknown'
  | 'unchecked'
  | 'after_cutoff'
  | 'not_marked'
  | 'still_open'
  | 'open_order'
  | 'paid_out'
  | 'refund_first'
  | 'refund_pending'
  | 'linked'

/**
 * The reason shown on a greyed-out row, and the line under it. Real money,
 * or money nobody can prove was a test, is said the same way: "Real payment —
 * kept". The detail says which.
 */
export const KEPT_REASONS: Record<KeptReason, { label: string; detail: string }> = {
  live: { label: 'Real payment — kept', detail: 'Razorpay says this was a live payment.' },
  cash: { label: 'Real payment — kept', detail: 'Paid in cash.' },
  unknown: {
    label: 'Real payment — kept',
    detail:
      "Razorpay couldn't confirm this was a test payment (or part of it was paid with Detlio credit), so it is treated as real.",
  },
  unchecked: {
    label: 'Not checked yet — kept',
    detail: 'Not checked with Razorpay yet. Finish checking to include it.',
  },
  after_cutoff: {
    label: 'Changed after the cutoff — kept',
    detail: 'Part of this booking was made after the cutoff, so it may be real.',
  },
  not_marked: {
    label: 'Not marked as Test — kept',
    detail: 'Only a booking marked as Test can be deleted on its own.',
  },
  still_open: {
    label: 'Checkout still open — kept',
    detail: 'Someone could still pay for this. Run again once it has expired.',
  },
  open_order: {
    label: 'Payment may still arrive — kept',
    detail:
      'A Razorpay order on this may be live and could still be paid. Run again a day after the booking is cancelled or the checkout has closed.',
  },
  paid_out: {
    label: 'Paid out to the garage — kept',
    detail:
      'A garage payout covered this booking together with one that is kept (or the payout was recorded after the cutoff, or it took real money). A payout is only deleted with every booking it paid.',
  },
  refund_first: {
    label: 'Real payment — refund it first',
    detail:
      'A booking marked Test that took real money can be deleted as a team test only once every rupee is refunded.',
  },
  refund_pending: {
    label: 'Refund still processing — kept',
    detail: "Razorpay hasn't finished the refund yet. Delete it once the refund is processed.",
  },
  linked: {
    label: 'Goes with another booking — kept',
    detail: 'This booking and its free redo go together, and the other one is kept.',
  },
}

/**
 * The line under a team test's row (0065): real money, all refunded, so it
 * may go, with its payments kept in the ledger.
 */
export const TEAM_TEST_LABEL = 'Real payment, refunded: deleted as team test, money record kept'

/** Plain words for each money class, for the list and the CSV. */
export const MONEY_LABELS: Record<MoneyClass, string> = {
  live: 'Live payment',
  cash: 'Cash',
  unknown: 'Not confirmed',
  unchecked: 'Not checked yet',
  test: 'Test payment',
  fake: 'E2E payment',
  no_money: 'Nothing paid',
}

// ─── The plan ────────────────────────────────────────────────────────────────

export interface ChainPlan {
  /** The chain's first booking: what its receipt number hangs off. */
  rootId: string
  reference: string
  bookingIds: string[]
  /** When the chain began, and the slot of its latest booking. */
  createdAt: Date
  scheduledAt: Date
  status: string
  garageId: string
  garageName: string
  customerId: string
  customerName: string
  customerPhone: string | null
  amount: string
  paymentStatus: string | null
  razorpayIds: string[]
  money: MoneyClass
  receiptNumber: string | null
  /** Everything refunded on the chain's payments and bills, in rupees. */
  refunded: string
  markedTest: boolean
  /** Why it is kept whatever is ticked; null when it can be deleted. */
  kept: KeptReason | null
  /**
   * The kept reason's line for this chain, when it says more than
   * KEPT_REASONS does ("Refund ₹299 first."); null otherwise.
   */
  keptDetail: string | null
  /**
   * A team test (0065): real money, every rupee refunded, so it may go with
   * its payments written to the ledger. Never ticked on a run's first look
   * (only on its own booking's page).
   */
  teamTest: boolean
  /**
   * Taken by a rule only the owner's delete has (10 Nov 2026): real money
   * not refunded, an order that may still be paid, or a garage payout. The
   * owner then types the booking's reference to confirm.
   */
  ownerOverride: boolean
  /** Still on (pending, confirmed or in progress): deleting ends it without telling anyone. */
  stillOn: boolean
  /** The owner's dry-run lines for it (see ownerLinesFor); empty for anyone else's. */
  ownerLines: string[]
  /** A payout covered it and stays on record: only its line goes (the owner's delete). */
  payoutKept: boolean
  /**
   * A payout covered it and goes too, written to the ledger first (the
   * owner's Delete forever of its garage, 10 Nov 2026).
   */
  payoutRemoved: boolean
  /** Ticked: deleted by this run. */
  selected: boolean
}

export interface CheckoutPlan {
  id: string
  reference: string
  createdAt: Date
  status: string
  customerId: string
  customerName: string
  garageName: string
  amount: string
  paymentRef: string | null
  money: MoneyClass
  refunded: string
  kept: KeptReason | null
  selected: boolean
}

export interface ResetCounts {
  /** Customer bookings: one per reschedule chain. */
  bookings: number
  /** Booking rows, a reschedule being a row of its own. */
  bookingRows: number
  bookingItems: number
  payments: number
  finalBills: number
  refundRecords: number
  photos: number
  notes: number
  reviews: number
  promoUses: number
  reschedules: number
  /** Checkouts (booking intents): the bookings' own and those that became none. */
  checkouts: number
  checkoutItems: number
  receiptNumbers: number
  /** Customer complaints made before the cutoff (0035). */
  complaints: number
  /** Usage events recorded before the cutoff (0040). */
  analyticsEvents: number
  /** Garage payouts (0038) that paid only bookings this run deletes. */
  payouts: number
  /** "Book directly" reports about the deleted bookings (0065). */
  bypassReports?: number
  /** Visit requests the deleted bookings were booked from (0065). */
  requests?: number
  /** Real payments, all refunded, written to the ledger before they go (0065). */
  teamTestPayments?: number
  /**
   * The owner's delete (10 Nov 2026): real payments not (or not yet)
   * refunded, and garage payout lines whose payout stays, both written to
   * the ledger before they go.
   */
  unrefundedPayments?: number
  payoutLines?: number
  /**
   * The owner's Delete forever (10 Nov 2026): the lines of the garage's
   * payouts that go with it, each written to the ledger first.
   */
  removedPayoutLines?: number
}

export type ReceiptYearMode = 'restart' | 'void'

export interface ReceiptYearPlan {
  financialYear: string
  mode: ReceiptYearMode
  /** The deleted chains' numbers in this year, lowest first. */
  numbers: string[]
  /** What the next receipt of the year will be. */
  nextNumber: string
  /** Void rows from an earlier run that a restart clears. */
  voidsCleared: number
  /** In plain words, for the dry run. */
  words: string
}

export interface ResetPlan {
  chains: ChainPlan[]
  checkouts: CheckoutPlan[]
  selectedChainIds: string[]
  selectedBookingIds: string[]
  /** Every checkout the run deletes: the bookings' own and the ticked ones. */
  selectedIntentIds: string[]
  selectedCheckoutIds: string[]
  /** Deletable rows left unticked because the run was over its cap. */
  overCap: { chains: number; checkouts: number }
  /**
   * The complaints in scope (a cutoff run's, made before the cutoff), oldest
   * first, and whether this run deletes them: all or none.
   */
  complaints: { ids: string[]; first: number | null; last: number | null; selected: boolean }
  /** The complaints this run deletes: all of `complaints.ids`, or none. */
  selectedComplaintIds: string[]
  /**
   * The usage events recorded before the cutoff (a cutoff run's), and
   * whether this run deletes them: all or none.
   */
  analyticsEvents: { count: number; selected: boolean }
  /** Delete every usage event recorded before this instant; null deletes none. */
  analyticsCutoff: Date | null
  /** Garage payouts this run deletes: those that paid only ticked chains. */
  selectedPayoutIds: string[]
  /** The ticked team tests' payments, for the ledger (0065). */
  ledger: TeamTestPayment[]
  /**
   * Payouts that paid a deleted chain and stay on record (the owner's
   * delete): only the deleted bookings' lines on them go.
   */
  keptPayoutIds: string[]
  /**
   * Detlio credit spent on deleted chains that goes back to the customer
   * (the owner's delete), one per payment.
   */
  creditReturns: Array<{ rootId: string; customerId: string; amount: string }>
  /**
   * What the person types: the phrase ("DELETE 1 BOOKING"), or the
   * booking's reference when the owner's delete takes what anyone else's
   * would keep (10 Nov 2026).
   */
  confirmKind: 'phrase' | 'reference'
  counts: ResetCounts
  receiptPlan: ReceiptYearPlan[]
  confirmPhrase: string
  selectionHash: string
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const k = key(row)
    const list = map.get(k)
    if (list) list.push(row)
    else map.set(k, [row])
  }
  return map
}

function toPaise(amount: string | null | undefined): number {
  const value = Number(amount ?? 0)
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}

function fromPaise(paise: number): string {
  return (paise / 100).toFixed(2)
}

/** The chain a booking belongs to: its first booking's id. */
export function chainRootOf(booking: { id: string; originalBookingId: string | null }): string {
  return booking.originalBookingId ?? booking.id
}

/** Groups bookings into reschedule chains, oldest booking first in each. */
export function groupChains(bookings: ResetBooking[]): Map<string, ResetBooking[]> {
  const chains = groupBy(bookings, chainRootOf)
  for (const list of chains.values()) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
  }
  return chains
}

/**
 * Why a chain in scope is kept whatever is ticked, or null when it may go.
 * Money first: it is the reason that matters most to the owner.
 */
function keptReasonOf(
  money: MoneyClass,
  openOrder: boolean,
  chain: ResetBooking[],
  scope: ResetScope,
  /** Marked Test: the chain, or the chain its free redo goes with. */
  marked: boolean,
  teamTest: TeamTestVerdict | null,
  /**
   * The owner's delete may take it (10 Nov 2026): the owner, and a booking
   * marked Test (scope `chains`) or a garage deleted forever.
   */
  ownerMay = false
): { kept: KeptReason | null; detail: string | null; teamTest: boolean; ownerOverride: boolean } {
  const keep = (kept: KeptReason, detail: string | null = null) => ({ kept, detail, teamTest: false, ownerOverride: false })
  let realMoney = false
  let ownerOverride = false
  if (!isDeletableMoney(money)) {
    // Real money keeps it, unless it is a team test (0065): marked Test,
    // never a garage's delete, and every rupee given back.
    const asTeamTest = scope.kind !== 'garage' && marked && teamTest?.deletable === true
    if (asTeamTest) {
      realMoney = true
    } else if (ownerMay) {
      // The owner's delete: real money no longer keeps it. Its payments go
      // to the ledger as they stand, refunded or not.
      realMoney = true
      ownerOverride = true
    } else if (scope.kind === 'garage' || !marked || !teamTest) {
      return keep(money as KeptReason)
    } else if (!teamTest.deletable) {
      return keep(teamTest.kept, teamTest.detail)
    }
  }
  if (openOrder) {
    // An order that may still be paid keeps it, but for the owner, whose
    // dry run names the order so a late payment can be refunded by hand.
    if (!ownerMay) return keep('open_order')
    ownerOverride = true
  }
  // A chain whose first booking is from before the cutoff but which changed
  // after it (moved to a new time by a customer who is now real) is kept
  // whole: a chain goes as a whole or not at all, and it may be real.
  if (scope.kind === 'before_cutoff' && chain.some((b) => b.createdAt >= scope.cutoff)) {
    return keep('after_cutoff')
  }
  if (scope.kind === 'chains' && !marked) return keep('not_marked')
  return { kept: null, detail: null, teamTest: realMoney, ownerOverride }
}

/**
 * Whether a chain's root is in scope at all. The repository reads whole
 * chains a little wider than the scope (a chain is fetched whole when any of
 * it matches); this is the exact rule.
 */
function chainInScope(rootId: string, chain: ResetBooking[], scope: ResetScope): boolean {
  switch (scope.kind) {
    case 'before_cutoff':
      // Begun before the cutoff: its first booking. A chain whose first row
      // is gone is dated by its oldest remaining one.
      return chain[0].createdAt < scope.cutoff
    case 'marked_test':
      return chain.some((b) => b.markedTestAt !== null)
    case 'chains':
      return chain.some((b) => scope.bookingIds.includes(b.id)) || scope.bookingIds.includes(rootId)
    case 'garage':
      // A reschedule stays at its garage, so a chain is one garage's whole.
      return chain.some((b) => b.vendorId === scope.vendorId)
  }
}

function sumRefunded(values: Array<string | null | undefined>): string {
  return fromPaise(values.reduce((sum, value) => sum + toPaise(value), 0))
}

/**
 * The receipt plan for the deleted chains' numbers, a year at a time.
 *
 * A year restarts only when nothing in it is kept: no receipt number of a
 * kept chain, and no kept chain still owed one (the receipt page would
 * number it on first open). Restarting means the year's numbers, voids and
 * counter go, and the next receipt is 000001. Any other year keeps its
 * counter: the deleted numbers are recorded as void and the series carries
 * on after the last one issued, so no real receipt is ever renumbered.
 */
export function planReceipts(input: {
  deletedRoots: Set<string>
  receipts: ResetReceipt[]
  yearReceipts: PlanInput['yearReceipts']
  unnumberedReceipts: PlanInput['unnumberedReceipts']
  counters: Map<string, number>
  voidsByYear: Map<string, number>
  /**
   * Deleted chains that took real money (team tests, 0065): a real receipt
   * was issued on each, so its year never restarts. Its numbers are void.
   */
  voidOnlyRoots?: Set<string>
}): ReceiptYearPlan[] {
  const deleted = input.receipts.filter((receipt) => input.deletedRoots.has(receipt.rootBookingId))
  const byYear = groupBy(deleted, (receipt) => receipt.financialYear)

  return [...byYear.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([financialYear, rows]) => {
      const numbers = rows.sort((a, b) => a.seq - b.seq).map((row) => row.number)
      const keptNumbered = input.yearReceipts.some(
        (row) => row.financialYear === financialYear && !input.deletedRoots.has(row.rootBookingId)
      )
      const keptUnnumbered = input.unnumberedReceipts.some(
        (row) =>
          !input.deletedRoots.has(row.rootBookingId) && financialYearOf(row.issuedAt) === financialYear
      )
      const realReceipt = rows.some((row) => input.voidOnlyRoots?.has(row.rootBookingId))

      if (!keptNumbered && !keptUnnumbered && !realReceipt) {
        const nextNumber = formatReceiptSerial(financialYear, 1)
        return {
          financialYear,
          mode: 'restart' as const,
          numbers,
          nextNumber,
          voidsCleared: input.voidsByYear.get(financialYear) ?? 0,
          words: `Numbering restarts at ${nextNumber}`,
        }
      }

      const lastIssued = Math.max(
        input.counters.get(financialYear) ?? 0,
        ...rows.map((row) => row.seq)
      )
      const nextNumber = formatReceiptSerial(financialYear, lastIssued + 1)
      const listed =
        numbers.length === 1
          ? `Receipt ${numbers[0]} is`
          : numbers.length === 2
            ? `Receipts ${numbers[0]} and ${numbers[1]} are`
            : `Receipts ${numbers[0]} and ${numbers.length - 1} others are`
      return {
        financialYear,
        mode: 'void' as const,
        numbers,
        nextNumber,
        voidsCleared: 0,
        words: `${listed} kept on record as void. The next receipt is ${nextNumber}`,
      }
    })
}

/**
 * The phrase the owner types to confirm: "DELETE 143 BOOKINGS". Bookings are
 * counted as customers think of them, one per chain; a run with only
 * checkouts names those instead, one with only complaints, those, and one
 * with only usage events, those.
 */
export function confirmPhraseFor(
  counts: { bookings: number; checkouts: number; complaints?: number; analyticsEvents?: number },
  checkoutsOnly: number
): string {
  if (counts.bookings > 0) {
    return `DELETE ${counts.bookings} ${counts.bookings === 1 ? 'BOOKING' : 'BOOKINGS'}`
  }
  const complaints = counts.complaints ?? 0
  if (checkoutsOnly === 0 && complaints > 0) {
    return `DELETE ${complaints} ${complaints === 1 ? 'COMPLAINT' : 'COMPLAINTS'}`
  }
  const events = counts.analyticsEvents ?? 0
  if (checkoutsOnly === 0 && events > 0) {
    return `DELETE ${events} ${events === 1 ? 'USAGE EVENT' : 'USAGE EVENTS'}`
  }
  return `DELETE ${checkoutsOnly} ${checkoutsOnly === 1 ? 'CHECKOUT' : 'CHECKOUTS'}`
}

/**
 * Whether what was typed is the phrase. Spaces at the ends and doubled
 * spaces are forgiven, the words and number are not, and nor is the case:
 * typing it out in capitals is the deliberate act.
 */
export function phraseMatches(typed: string, phrase: string): boolean {
  return typed.trim().replace(/\s+/g, ' ') === phrase
}

/**
 * Whether what was typed is the booking's reference (the owner's delete,
 * 10 Nov 2026): "AD200012" or "#AD200012", in any case, spaces at the ends
 * forgiven. It is read off the screen, so the case is not the deliberate act
 * here: finding and typing the right booking is.
 */
export function referenceMatches(typed: string, reference: string): boolean {
  return typed.trim().replace(/^#/, '').toUpperCase() === reference.toUpperCase()
}

/** The typed confirmation, read the way the plan asks for it. */
export function confirmMatches(typed: string, plan: Pick<ResetPlan, 'confirmKind' | 'confirmPhrase'>): boolean {
  return plan.confirmKind === 'reference'
    ? referenceMatches(typed, plan.confirmPhrase)
    : phraseMatches(typed, plan.confirmPhrase)
}

/**
 * A fingerprint of exactly what the run deletes: every selected chain's
 * rows with their payment state, refunds and money class, the selected
 * checkouts, and the receipt plan. The delete recomputes it under its locks
 * and refuses (409 PREVIEW_STALE) if anything moved since the dry run.
 */
export function selectionHash(plan: {
  chains: ChainPlan[]
  checkouts: CheckoutPlan[]
  bookings: ResetBooking[]
  charges: ResetCharge[]
  receiptPlan: ReceiptYearPlan[]
  /** Only when there are any, so a run with none hashes as it always did. */
  complaintIds?: string[]
  /** The same. */
  payoutIds?: string[]
  /** The ticked team tests' refunds (0065): the same, only when there are any. */
  teamTest?: Array<{ root: string; refunds: ResetRefund[] }>
  /**
   * The chains the owner's delete takes that anyone else's would keep, and
   * the payouts it leaves on record (10 Nov 2026): the same.
   */
  owner?: Array<{ root: string; payoutKept: boolean }>
  keptPayoutIds?: string[]
}): string {
  const bookingsByRoot = groupChains(plan.bookings)
  const chargesByBooking = groupBy(plan.charges, (charge) => charge.bookingId)
  const chains = plan.chains
    .filter((chain) => chain.selected)
    .map((chain) => ({
      root: chain.rootId,
      money: chain.money,
      rows: (bookingsByRoot.get(chain.rootId) ?? [])
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((b) => ({
          id: b.id,
          status: b.status,
          payment: b.payment
            ? [b.payment.status, b.payment.gatewayTxnId, toPaise(b.payment.refundedAmount)]
            : null,
          charges: (chargesByBooking.get(b.id) ?? [])
            .slice()
            .sort((x, y) => x.id.localeCompare(y.id))
            .map((c) => [c.id, c.status, c.gatewayPaymentId, toPaise(c.refundedAmount)]),
        })),
    }))
    .sort((a, b) => a.root.localeCompare(b.root))
  const checkouts = plan.checkouts
    .filter((checkout) => checkout.selected)
    .map((checkout) => [checkout.id, checkout.status, checkout.paymentRef, checkout.money, checkout.refunded])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  const receipts = plan.receiptPlan.map((year) => [year.financialYear, year.mode, year.numbers])
  const complaints = [...(plan.complaintIds ?? [])].sort()
  const payouts = [...(plan.payoutIds ?? [])].sort()
  const teamTest = (plan.teamTest ?? [])
    .map((chain) => ({
      root: chain.root,
      refunds: chain.refunds
        .map((r) => [r.kind, r.targetId, r.refundRef, toPaise(r.amount), r.gatewayStatus, r.recordedAt.toISOString()])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    }))
    .sort((a, b) => a.root.localeCompare(b.root))
  const owner = [...(plan.owner ?? [])].sort((a, b) => a.root.localeCompare(b.root))
  const keptPayouts = [...(plan.keptPayoutIds ?? [])].sort()

  return createHash('sha256')
    .update(
      JSON.stringify({
        chains,
        checkouts,
        receipts,
        ...(complaints.length > 0 ? { complaints } : {}),
        ...(payouts.length > 0 ? { payouts } : {}),
        ...(teamTest.length > 0 ? { teamTest } : {}),
        ...(owner.length > 0 ? { owner } : {}),
        ...(keptPayouts.length > 0 ? { keptPayouts } : {}),
      })
    )
    .digest('hex')
}

/**
 * Chains joined by the payouts that paid them: two chains paid by one payout
 * are in one group, and so is a third paid with either by another. Each
 * group with its payouts; a chain no payout paid is in none.
 */
export function payoutGroups(payouts: ResetPayout[]): Array<{ roots: string[]; payouts: ResetPayout[] }> {
  return chainGroups(payouts, []).map(({ roots, payouts: paid }) => ({ roots, payouts: paid }))
}

/**
 * Chains that go together: joined by the payouts that paid them, and by a
 * free redo (0065) to the chain whose claim it answers. Each group with its
 * payouts and whether a redo joins it; a chain joined to nothing is in none.
 */
export function chainGroups(
  payouts: ResetPayout[],
  links: Array<[string, string]>
): Array<{ roots: string[]; payouts: ResetPayout[]; linked: boolean }> {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)!
    parent.set(x, root)
    return root
  }
  const add = (x: string) => {
    if (!parent.has(x)) parent.set(x, x)
  }
  for (const payout of payouts) {
    const key = `payout:${payout.id}`
    add(key)
    for (const root of payout.rootBookingIds) {
      add(root)
      parent.set(find(root), find(key))
    }
  }
  const linkedRoots = new Set<string>()
  for (const [a, b] of links) {
    if (a === b) continue
    add(a)
    add(b)
    linkedRoots.add(a)
    linkedRoots.add(b)
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  const groups = new Map<string, { roots: string[]; payouts: ResetPayout[]; linked: boolean }>()
  const groupOf = (x: string) => {
    const k = find(x)
    const group = groups.get(k) ?? { roots: [], payouts: [], linked: false }
    groups.set(k, group)
    return group
  }
  for (const payout of payouts) groupOf(`payout:${payout.id}`).payouts.push(payout)
  for (const x of parent.keys()) {
    if (x.startsWith('payout:')) continue
    const group = groupOf(x)
    group.roots.push(x)
    if (linkedRoots.has(x)) group.linked = true
  }
  return [...groups.values()].map((group) => ({
    roots: [...new Set(group.roots)].sort(),
    payouts: group.payouts,
    linked: group.linked,
  }))
}

/**
 * Decides the run: which chains and checkouts are in scope, which of them
 * are kept and why, which are ticked, what that deletes table by table, the
 * receipt plan, the confirmation phrase and the fingerprint.
 */
export function planReset(input: PlanInput): ResetPlan {
  const { scope } = input
  const only = input.only
    ? {
        chains: new Set(input.only.chainIds),
        checkouts: new Set(input.only.checkoutIds),
        complaints: input.only.complaints === true,
        analytics: input.only.analytics === true,
      }
    : null
  const chargesByBooking = groupBy(input.charges, (charge) => charge.bookingId)
  const receiptByRoot = new Map(input.receipts.map((receipt) => [receipt.rootBookingId, receipt]))

  // ── Chains ──
  const allChains = groupChains(input.bookings)
  const rootOfBooking = new Map(input.bookings.map((b) => [b.id, chainRootOf(b)]))
  // A free redo and the chain whose claim it answers (0065), as chain roots.
  const redoPairs: Array<[string, string]> = (input.redoLinks ?? []).flatMap((link) => {
    const a = rootOfBooking.get(link.bookingId)
    const b = rootOfBooking.get(link.redoBookingId)
    return a && b && a !== b ? [[a, b] as [string, string]] : []
  })
  const redoGroups = chainGroups([], redoPairs)
  const redoGroupOf = new Map<string, string[]>()
  for (const group of redoGroups) for (const root of group.roots) redoGroupOf.set(root, group.roots)
  const partnersOf = (root: string) => redoGroupOf.get(root) ?? [root]
  // In scope on its own, or with the chain its free redo goes with.
  const ownScope = new Set(
    [...allChains].filter(([rootId, rows]) => chainInScope(rootId, rows, scope)).map(([rootId]) => rootId)
  )
  const inScope = (root: string) => partnersOf(root).some((partner) => ownScope.has(partner))
  // Marked Test: the chain, or one it goes with.
  const markedOwn = (root: string) => (allChains.get(root) ?? []).some((b) => b.markedTestAt !== null)
  const markedGroup = (root: string) => partnersOf(root).some(markedOwn)

  // The owner's delete (10 Nov 2026): a booking marked Test, or every chain
  // of a garage deleted forever. Nobody else's run ever has it.
  const ownerMay = (root: string) =>
    input.owner === true && (scope.kind === 'garage' || (scope.kind === 'chains' && markedGroup(root)))

  const chains: ChainPlan[] = []
  const refundsOf = new Map<string, ResetRefund[]>()
  const moneyOf = new Map<string, ChainMoney[]>()
  const openOrdersOf = new Map<string, string[]>()
  for (const [rootId, rows] of allChains) {
    if (!inScope(rootId)) continue
    const charges = rows.flatMap((b) => chargesByBooking.get(b.id) ?? [])
    const money = worst(chainMoneyItems(rows, charges).map((item) => classOf(item, input)))
    const latest = rows[rows.length - 1]
    const liveOrders = chainOpenOrders(rows, charges).filter(
      (order) => mayStillBePaid(order, input.now) && mayBeLive(order, input.lookups)
    )
    const openOrder = liveOrders.length > 0
    openOrdersOf.set(rootId, liveOrders.map((order) => order.gatewayId))
    const targets = new Set([...rows.map((b) => b.id), ...charges.map((c) => c.id)])
    const refunds = (input.refunds ?? []).filter((refund) => targets.has(refund.targetId))
    const placed = chainMoney(rows, charges, refunds, input)
    refundsOf.set(rootId, refunds)
    moneyOf.set(rootId, placed)
    const verdict = keptReasonOf(
      money,
      openOrder,
      rows,
      scope,
      markedGroup(rootId),
      teamTestVerdict(placed),
      ownerMay(rootId)
    )
    const razorpayIds = [
      ...new Set(
        [
          ...rows.map((b) => b.payment?.gatewayTxnId),
          ...charges.map((c) => c.gatewayPaymentId ?? c.gatewayOrderId),
        ].filter((value): value is string => Boolean(value))
      ),
    ]
    chains.push({
      rootId,
      reference: bookingReference(rootId),
      bookingIds: rows.map((b) => b.id),
      createdAt: rows[0].createdAt,
      scheduledAt: latest.scheduledAt,
      status: latest.status,
      garageId: latest.vendorId,
      garageName: latest.garageName,
      customerId: latest.userId,
      customerName: latest.customerName,
      customerPhone: latest.customerPhone ?? null,
      amount: latest.amount,
      paymentStatus: latest.payment?.status ?? null,
      razorpayIds,
      money,
      receiptNumber: receiptByRoot.get(rootId)?.number ?? null,
      // A reschedule copies the payment row, so the chain's refunds are on
      // its latest booking's payment (refunds of a moved booking's payment
      // are not owed and not recorded) plus every bill.
      refunded: sumRefunded([latest.payment?.refundedAmount, ...charges.map((c) => c.refundedAmount)]),
      markedTest: rows.some((b) => b.markedTestAt !== null),
      kept: verdict.kept,
      keptDetail: verdict.detail,
      teamTest: verdict.teamTest,
      ownerOverride: verdict.ownerOverride,
      stillOn: STILL_ON.has(latest.status),
      ownerLines: [],
      payoutKept: false,
      payoutRemoved: false,
      selected: false,
    })
  }
  // Oldest first: the order the owner reads them in, and the order the cap
  // takes them in.
  chains.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.rootId.localeCompare(b.rootId))

  // ── Chains that go together ──
  // Chains paid out together go together: a group joined by its payouts is
  // kept whole if any of it is kept, or out of scope, or was paid out after
  // the cutoff (a payout made then may be real), or took real money (a team
  // test is never deleted once a garage was paid for it, 0065). A free redo
  // and the chain whose claim it answers go together the same way.
  const groups = chainGroups(input.payouts ?? [], redoPairs)
  const chainByRoot = new Map(chains.map((chain) => [chain.rootId, chain]))
  // Payouts the owner's delete leaves on record, with only the deleted
  // bookings' lines taken off them.
  const detachedPayouts = new Set<string>()
  for (const group of groups) {
    const members = group.roots.map((root) => chainByRoot.get(root))
    const paidOutBlock =
      group.payouts.length > 0 &&
      ((scope.kind === 'before_cutoff' && group.payouts.some((payout) => payout.recordedAt >= scope.cutoff)) ||
        members.some((chain) => chain?.teamTest))
    const blocked = paidOutBlock || members.some((chain) => !chain || chain.kept !== null)
    if (!blocked) continue
    if (group.payouts.length > 0 && members.some((chain) => chain && chain.kept === null && ownerMay(chain.rootId))) {
      // The owner's delete (10 Nov 2026): a payout keeps nothing, since it
      // stays on record (or, Delete forever, goes to the ledger). A free
      // redo still goes with the booking whose claim it answers, so a chain
      // whose partner is kept stays kept.
      const taken: ChainPlan[] = []
      for (const chain of members) {
        if (!chain || chain.kept !== null) continue
        const partnerKept = partnersOf(chain.rootId).some((root) => {
          const partner = chainByRoot.get(root)
          return !partner || (partner.kept !== null && partner.kept !== 'paid_out')
        })
        if (partnerKept || !ownerMay(chain.rootId)) {
          chain.kept = partnerKept ? 'linked' : 'paid_out'
          chain.keptDetail = null
          chain.teamTest = false
          chain.ownerOverride = false
          continue
        }
        taken.push(chain)
        chain.ownerOverride = true
      }
      // Delete forever by the owner (10 Nov 2026: "an owner of the admin
      // panel can clear or delete anything"): the garage's own payouts go
      // with it, each line written to the ledger first. A payout to another
      // garage (for a free redo there, which goes with its booking), or one
      // that paid a booking that stays, is left on record as on one
      // booking's delete, with only the deleted bookings' lines gone.
      const goesWithGarage = (payout: ResetPayout) =>
        scope.kind === 'garage' &&
        payout.rootBookingIds.every((root) => {
          const chain = chainByRoot.get(root)
          return chain !== undefined && chain.kept === null && chain.garageId === scope.vendorId
        })
      for (const payout of group.payouts) if (!goesWithGarage(payout)) detachedPayouts.add(payout.id)
      for (const chain of taken) {
        chain.payoutKept = group.payouts.some(
          (payout) => detachedPayouts.has(payout.id) && payout.rootBookingIds.includes(chain.rootId)
        )
      }
      continue
    }
    for (const chain of members) {
      if (!chain || chain.kept !== null) continue
      chain.kept = group.payouts.length > 0 ? 'paid_out' : 'linked'
      chain.keptDetail = null
      chain.teamTest = false
    }
  }

  let overCapChains = 0
  let ticked = 0
  const capped = new Set<string>()
  for (const chain of chains) {
    if (chain.kept) continue
    if (only && !only.chains.has(chain.rootId)) continue
    // A team test is ticked by hand on a run over many bookings, never on
    // the first look; on its own booking's page it is the one in question,
    // and a garage deleted forever by the owner takes every chain it has.
    if (!only && chain.teamTest && (scope.kind === 'before_cutoff' || scope.kind === 'marked_test')) continue
    if (ticked >= MAX_CHAINS_PER_RUN) {
      overCapChains += 1
      capped.add(chain.rootId)
      continue
    }
    chain.selected = true
    ticked += 1
  }
  // A group goes whole or not at all: one left unticked (or past the cap)
  // keeps the rest of its group unticked with it; past the cap, they wait
  // for the next run together.
  for (const group of groups) {
    // A payout left on record joins nothing: only a free redo and its
    // booking go together there.
    const parts = group.payouts.some((payout) => detachedPayouts.has(payout.id))
      ? chainGroups([], redoPairs.filter(([a]) => group.roots.includes(a)))
      : [group]
    for (const part of parts) {
      const members = part.roots.map((root) => chainByRoot.get(root))
      if (members.every((chain) => chain?.selected)) continue
      const waits = part.roots.some((root) => capped.has(root))
      for (const chain of members) {
        if (chain?.selected) {
          chain.selected = false
          if (waits) overCapChains += 1
        }
      }
    }
  }

  // ── Checkouts that never became a booking ──
  // A cutoff run takes those opened before the cutoff; a garage's delete
  // takes every one it was given, which are that garage's. The other scopes
  // are about bookings alone.
  const checkouts: CheckoutPlan[] = []
  if (scope.kind === 'before_cutoff' || scope.kind === 'garage') {
    for (const intent of input.intents) {
      if (intent.bookingId !== null) continue
      if (scope.kind === 'before_cutoff' && intent.createdAt >= scope.cutoff) continue
      const money = worst(checkoutMoneyItems(intent).map((item) => classOf(item, input)))
      // A checkout that can still be paid is never deleted: the money would
      // land with nothing left to record it against. Nor is one whose live
      // order could still be captured after its sheet closed.
      const open = intent.status === 'pending' && intent.expiresAt > input.now
      const openOrder = hasOpenOrder(checkoutOpenOrders(intent), input)
      checkouts.push({
        id: intent.id,
        reference: bookingReference(intent.id),
        createdAt: intent.createdAt,
        status: intent.status,
        customerId: intent.userId,
        customerName: intent.customerName,
        garageName: intent.garageName,
        amount: intent.amount,
        paymentRef: intent.paymentRef,
        money,
        refunded: sumRefunded([intent.refundedAmount]),
        kept: !isDeletableMoney(money)
          ? (money as KeptReason)
          : open
            ? 'still_open'
            : openOrder
              ? 'open_order'
              : null,
        selected: false,
      })
    }
  }
  checkouts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
  let overCapCheckouts = 0
  let tickedCheckouts = 0
  for (const checkout of checkouts) {
    if (checkout.kept) continue
    if (only && !only.checkouts.has(checkout.id)) continue
    if (tickedCheckouts >= MAX_CHECKOUTS_PER_RUN) {
      overCapCheckouts += 1
      continue
    }
    checkout.selected = true
    tickedCheckouts += 1
  }

  // ── Complaints made before the cutoff ──
  // Not part of any chain (a complaint only points at its booking, and is
  // kept with a null booking when the booking goes), so a cutoff run takes
  // them as one group: all ticked on the first look, and after that only
  // when the tick says so. No money and no receipts hang off them.
  //
  // Deleting one test booking (scope `chains`) takes the complaints about
  // the bookings it deletes, and only those: they go with their chain, so
  // they follow its tick rather than one of their own. Since 0065 every run
  // but a garage's delete does the same for the chains it deletes (a Test
  // run's, or a cutoff run's made after its cutoff), so no complaint is left
  // about a booking that never was.
  const chainBookings = new Set(chains.filter((c) => c.selected).flatMap((c) => c.bookingIds))
  const byNumber = (a: ResetComplaint, b: ResetComplaint) => a.number - b.number
  const aboutDeleted =
    scope.kind === 'garage'
      ? []
      : (input.complaints ?? [])
          .filter((complaint) => complaint.bookingId != null && chainBookings.has(complaint.bookingId))
          .sort(byNumber)
  const complaintsInScope =
    scope.kind === 'before_cutoff'
      ? (input.complaints ?? []).filter((complaint) => complaint.createdAt < scope.cutoff).sort(byNumber)
      : scope.kind === 'chains'
        ? aboutDeleted
        : []
  const complaintsTicked = only && scope.kind !== 'chains' ? only.complaints : true
  const selectedComplaintIds = [
    ...new Set([
      ...(complaintsTicked ? complaintsInScope.map((complaint) => complaint.id) : []),
      ...aboutDeleted.map((complaint) => complaint.id),
    ]),
  ]

  // ── Usage events recorded before the cutoff ──
  // Anonymous rows that point at nothing, taken like the complaints: one
  // tick for all of them, on by default. Counted rather than listed, and
  // left out of the fingerprint: nothing about them can change what else
  // the run deletes, and the 180-day clean-up may trim the oldest between
  // the dry run and the delete.
  const analyticsInScope = scope.kind === 'before_cutoff' ? (input.analyticsEvents ?? 0) : 0
  const analyticsTicked = (only ? only.analytics : true) && analyticsInScope > 0

  // ── What that deletes ──
  const selectedChainIds = chains.filter((c) => c.selected).map((c) => c.rootId)
  const selectedRoots = new Set(selectedChainIds)
  const selectedPayoutIds = groups
    .flatMap((group) =>
      // A group split by a payout left on record (the owner's delete): each
      // other payout goes with the bookings it paid itself.
      group.payouts.some((payout) => detachedPayouts.has(payout.id))
        ? group.payouts.filter(
            (payout) =>
              !detachedPayouts.has(payout.id) && payout.rootBookingIds.every((root) => selectedRoots.has(root))
          )
        : group.roots.every((root) => selectedRoots.has(root))
          ? group.payouts
          : []
    )
    .map((payout) => payout.id)
    .sort()
  const keptPayouts = (input.payouts ?? []).filter(
    (payout) => detachedPayouts.has(payout.id) && payout.rootBookingIds.some((root) => selectedRoots.has(root))
  )
  const keptPayoutIds = keptPayouts.map((payout) => payout.id).sort()
  const linesOn = (payouts: ResetPayout[], root: string) =>
    payouts
      .filter((payout) => payout.rootBookingIds.includes(root))
      .map((payout) => ({
        payout,
        amount: payout.items?.find((item) => item.rootBookingId === root)?.amount ?? null,
      }))
  const payoutLinesOf = (root: string) => linesOn(keptPayouts, root)
  // The owner's Delete forever takes the garage's payouts with it, each
  // written to the ledger first (10 Nov 2026). Anyone else's delete of a
  // garage removes only payouts of test money, as before, with no ledger.
  const selectedPayouts = new Set(selectedPayoutIds)
  const removedPayouts =
    input.owner === true && scope.kind === 'garage'
      ? (input.payouts ?? []).filter((payout) => selectedPayouts.has(payout.id))
      : []
  const removedLinesOf = (root: string) =>
    linesOn(removedPayouts, root).map((line) => ({ ...line, removed: true }))
  for (const chain of chains) {
    if (chain.selected && removedLinesOf(chain.rootId).length > 0) chain.payoutRemoved = true
  }
  // What the dry run says under each chain that may go: that it is still
  // on, and (the owner's delete) the money it leaves as it stands.
  for (const chain of chains) {
    if (chain.kept) continue
    chain.ownerLines = ownerLinesFor({
      stillOn: chain.stillOn,
      money: chain.ownerOverride || chain.teamTest ? (moneyOf.get(chain.rootId) ?? []) : [],
      openOrderIds: chain.ownerOverride ? (openOrdersOf.get(chain.rootId) ?? []) : [],
      payouts: chain.payoutKept
        ? payoutLinesOf(chain.rootId)
        : chain.payoutRemoved
          ? removedLinesOf(chain.rootId)
          : [],
      garageName: chain.garageName,
    })
  }
  const selectedBookingIds = chains.filter((c) => c.selected).flatMap((c) => c.bookingIds)
  const selectedBookings = new Set(selectedBookingIds)
  const selectedCheckoutIds = checkouts.filter((c) => c.selected).map((c) => c.id)
  const ownIntentIds = input.intents
    .filter((intent) => intent.bookingId !== null && selectedBookings.has(intent.bookingId))
    .map((intent) => intent.id)
  const selectedIntentIds = [...new Set([...ownIntentIds, ...selectedCheckoutIds])].sort()

  const counts: ResetCounts = {
    bookings: selectedChainIds.length,
    bookingRows: selectedBookingIds.length,
    bookingItems: 0,
    payments: 0,
    finalBills: 0,
    refundRecords: 0,
    photos: 0,
    notes: 0,
    reviews: 0,
    promoUses: 0,
    reschedules: 0,
    checkouts: selectedIntentIds.length,
    checkoutItems: 0,
    receiptNumbers: 0,
    complaints: selectedComplaintIds.length,
    analyticsEvents: analyticsTicked ? analyticsInScope : 0,
    payouts: selectedPayoutIds.length,
    bypassReports: 0,
    requests: 0,
    teamTestPayments: 0,
  }
  const bookingsById = new Map(input.bookings.map((b) => [b.id, b]))
  for (const id of selectedBookingIds) {
    const child = input.bookingChildCounts.get(id)
    if (bookingsById.get(id)?.payment) counts.payments += 1
    counts.finalBills += chargesByBooking.get(id)?.length ?? 0
    if (!child) continue
    counts.bookingItems += child.items
    counts.notes += child.notes
    counts.photos += child.photos
    counts.reviews += child.reviews
    counts.promoUses += child.promoUses
    counts.refundRecords += child.refundRecords
    counts.bypassReports = (counts.bypassReports ?? 0) + (child.bypassReports ?? 0)
    counts.requests = (counts.requests ?? 0) + (child.requests ?? 0)
  }
  for (const root of selectedChainIds) counts.reschedules += input.reschedulesByChain.get(root) ?? 0
  for (const id of selectedIntentIds) {
    const child = input.intentChildCounts.get(id)
    counts.checkoutItems += child?.items ?? 0
    counts.refundRecords += child?.refundRecords ?? 0
  }
  counts.receiptNumbers = input.receipts.filter((r) => selectedRoots.has(r.rootBookingId)).length

  // ── The team tests' payments, for the ledger (0065) ──
  const teamTests = chains.filter((chain) => chain.selected && chain.teamTest)
  const intentsByBooking = groupBy(
    input.intents.filter((intent) => intent.bookingId !== null),
    (intent) => intent.bookingId!
  )
  const paymentRows: TeamTestPayment[] = teamTests.flatMap((chain) =>
    (moneyOf.get(chain.rootId) ?? [])
      // Real money; and, on the owner's delete, credit spent alongside test
      // money, which goes back to the customer and is recorded with it.
      .filter((item) => !isDeletableMoney(item.money) || (chain.ownerOverride && item.creditPaise > 0))
      .map((item): TeamTestPayment => {
        // A booking's order is its checkout's (consumeIntent copies the
        // payment id onto the payment, and the order stays on the checkout).
        const order =
          item.kind === 'booking'
            ? (item.targetIds
                .flatMap((id) => intentsByBooking.get(id) ?? [])
                .map((intent) => intent.gatewayTxnId)
                .find((id): id is string => Boolean(id)) ?? null)
            : (input.charges.find((charge) => charge.id === item.chargeId)?.gatewayOrderId ?? null)
        return {
          rootId: chain.rootId,
          reference: chain.reference,
          bookingIds: chain.bookingIds,
          kind: item.kind,
          chargeId: item.chargeId,
          razorpayPaymentId:
            item.kind === 'booking'
              ? item.gatewayId
              : (input.charges.find((charge) => charge.id === item.chargeId)?.gatewayPaymentId ?? null),
          razorpayOrderId: order,
          gatewayMode: item.gatewayMode,
          amount: fromPaise(item.amountPaise),
          refundedAmount: fromPaise(item.refundedPaise),
          refunds: item.refunds
            .slice()
            .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
            .map((refund) => ({
              refundRef: refund.refundRef,
              amount: refund.amount,
              source: refund.source,
              gatewayStatus: refund.gatewayStatus,
              recordedBy: refund.recordedBy,
              recordedAt: refund.recordedAt.toISOString(),
            })),
          receiptNumber: chain.receiptNumber,
          vendorId: chain.garageId,
          garageName: chain.garageName,
          customerId: chain.customerId,
          paidAt: item.paidAt,
          bookedAt: chain.createdAt,
          state: ledgerStateOf(item),
          // The amount beside credit given back is test money, said so the
          // record isn't read as real money that went nowhere.
          note:
            item.amountPaise > 0 && item.creditPaise > 0 && isDeletableMoney(item.money)
              ? 'Razorpay part was test money; only the Detlio credit was real'
              : null,
          // Back with the customer, now (creditReturns) or before the delete.
          creditReturned: fromPaise(item.creditPaise),
          vendorPayoutId: null,
        }
      })
  )
  // A payout that stays on record, or (Delete forever) goes with the
  // garage, a row per deleted chain it paid (the owner's delete): what was
  // paid on the chain, to whom and when. A payout's rows add up to what it
  // paid, less any lines an earlier delete already wrote down.
  const payoutRowsOf = (chain: ChainPlan, lines: ReturnType<typeof linesOn>, removed: boolean): TeamTestPayment[] =>
    lines
      .filter(({ amount }) => amount !== null && toPaise(amount) !== 0)
      .map(({ payout, amount }) => ({
        rootId: chain.rootId,
        reference: chain.reference,
        bookingIds: chain.bookingIds,
        kind: 'payout' as const,
        chargeId: null,
        razorpayPaymentId: null,
        razorpayOrderId: null,
        gatewayMode: null,
        amount: fromPaise(toPaise(amount)),
        refundedAmount: '0.00',
        refunds: [],
        receiptNumber: chain.receiptNumber,
        vendorId: chain.garageId,
        garageName: chain.garageName,
        customerId: chain.customerId,
        paidAt: payout.paidAt ?? payout.recordedAt,
        bookedAt: chain.createdAt,
        state: 'paid_out' as const,
        note: removed ? removedPayoutNote(chain.garageName, payout) : paidOutNote(chain.garageName, payout).slice(0, 300),
        creditReturned: '0.00',
        vendorPayoutId: payout.id,
      }))
  const keptPayoutRows = chains
    .filter((chain) => chain.selected && chain.payoutKept)
    .flatMap((chain) => payoutRowsOf(chain, payoutLinesOf(chain.rootId), false))
  const removedPayoutRows = chains
    .filter((chain) => chain.selected && chain.payoutRemoved)
    .flatMap((chain) => payoutRowsOf(chain, linesOn(removedPayouts, chain.rootId), true))
  const ledger = [...paymentRows, ...keptPayoutRows, ...removedPayoutRows]
  // Credit paid alone goes back with the delete, so it reads as refunded.
  const givenBack = (row: TeamTestPayment) => row.state === 'refunded' || row.state === 'credit_returned'
  counts.teamTestPayments = paymentRows.filter(givenBack).length
  // Only the owner's delete takes these, so they are said only when there
  // are some: every other run's counts (and its audit row) stay as before.
  const unrefundedPayments = paymentRows.filter((row) => !givenBack(row)).length
  if (unrefundedPayments > 0) counts.unrefundedPayments = unrefundedPayments
  if (keptPayoutRows.length > 0) counts.payoutLines = keptPayoutRows.length
  if (removedPayoutRows.length > 0) counts.removedPayoutLines = removedPayoutRows.length

  // Credit spent on a deleted chain goes back to the customer (the owner's
  // delete; anyone else's keeps a chain that spent credit).
  const creditReturns = chains
    .filter((chain) => chain.selected)
    .flatMap((chain) =>
      (moneyOf.get(chain.rootId) ?? [])
        .filter((item) => item.creditPaise > 0 && !item.creditReturned)
        .map((item) => ({ rootId: chain.rootId, customerId: chain.customerId, amount: fromPaise(item.creditPaise) }))
    )

  // The owner types the booking's reference when the delete takes what
  // anyone else's would keep: the one they opened, from its page.
  const ownerTaken = chains.filter((chain) => chain.selected && chain.ownerOverride)
  const confirmKind: ResetPlan['confirmKind'] =
    scope.kind === 'chains' && ownerTaken.length > 0 ? 'reference' : 'phrase'
  const openedRoot = scope.kind === 'chains' ? rootOfBooking.get(scope.bookingIds[0] ?? '') : undefined

  const receiptPlan = planReceipts({
    deletedRoots: selectedRoots,
    receipts: input.receipts,
    yearReceipts: input.yearReceipts,
    unnumberedReceipts: input.unnumberedReceipts,
    counters: input.counters,
    voidsByYear: input.voidsByYear,
    voidOnlyRoots: new Set(teamTests.map((chain) => chain.rootId)),
  })

  return {
    chains,
    checkouts,
    selectedChainIds,
    selectedBookingIds,
    selectedIntentIds,
    selectedCheckoutIds,
    overCap: { chains: overCapChains, checkouts: overCapCheckouts },
    complaints: {
      ids: complaintsInScope.map((complaint) => complaint.id),
      first: complaintsInScope[0]?.number ?? null,
      last: complaintsInScope[complaintsInScope.length - 1]?.number ?? null,
      selected: complaintsTicked && complaintsInScope.length > 0,
    },
    selectedComplaintIds,
    analyticsEvents: { count: analyticsInScope, selected: analyticsTicked },
    analyticsCutoff: analyticsTicked && scope.kind === 'before_cutoff' ? scope.cutoff : null,
    selectedPayoutIds,
    ledger,
    keptPayoutIds,
    creditReturns,
    confirmKind,
    counts,
    receiptPlan,
    confirmPhrase:
      confirmKind === 'reference'
        ? bookingReference(openedRoot && selectedRoots.has(openedRoot) ? openedRoot : ownerTaken[0].rootId)
        : confirmPhraseFor(counts, selectedCheckoutIds.length),
    selectionHash: selectionHash({
      chains,
      checkouts,
      bookings: input.bookings,
      charges: input.charges,
      receiptPlan,
      complaintIds: selectedComplaintIds,
      payoutIds: selectedPayoutIds,
      teamTest: teamTests.map((chain) => ({ root: chain.rootId, refunds: refundsOf.get(chain.rootId) ?? [] })),
      owner: ownerTaken.map((chain) => ({ root: chain.rootId, payoutKept: chain.payoutKept })),
      keptPayoutIds,
    }),
  }
}

/**
 * The dry run's counts in plain words, the biggest first, leaving out what
 * is zero: "143 bookings", "12 refunds recorded", "38 job photos".
 */
/**
 * What a run leaves alone though it could delete it: the chains and checkouts
 * not ticked (or past the run's cap), by id, and the complaints when their one
 * tick is off. The audit row names them, so it accounts for every row in scope.
 */
export function untickedRows(plan: ResetPlan): { rowIds: string[]; complaintIds: string[] } {
  const rowIds = [
    ...plan.chains.filter((chain) => !chain.kept && !chain.selected).map((chain) => chain.rootId),
    ...plan.checkouts.filter((checkout) => !checkout.kept && !checkout.selected).map((checkout) => checkout.id),
  ]
  return { rowIds, complaintIds: plan.complaints.selected ? [] : plan.complaints.ids }
}

export function countLines(counts: ResetCounts): string[] {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const lines: Array<[number, string]> = [
    [counts.bookings, plural(counts.bookings, 'booking', 'bookings')],
    [counts.payments, plural(counts.payments, 'payment record', 'payment records')],
    [counts.refundRecords, plural(counts.refundRecords, 'refund recorded', 'refunds recorded')],
    [counts.finalBills, plural(counts.finalBills, 'final bill', 'final bills')],
    [counts.photos, plural(counts.photos, 'job photo', 'job photos')],
    [counts.notes, plural(counts.notes, 'team note', 'team notes')],
    [counts.reviews, plural(counts.reviews, 'review', 'reviews')],
    [counts.promoUses, plural(counts.promoUses, 'promo code use', 'promo code uses')],
    [counts.reschedules, plural(counts.reschedules, 'reschedule', 'reschedules')],
    [counts.checkouts, plural(counts.checkouts, 'checkout', 'checkouts')],
    [counts.receiptNumbers, plural(counts.receiptNumbers, 'receipt number', 'receipt numbers')],
    [counts.complaints, plural(counts.complaints, 'complaint', 'complaints')],
    [counts.analyticsEvents ?? 0, plural(counts.analyticsEvents ?? 0, 'usage event', 'usage events')],
    [counts.payouts ?? 0, plural(counts.payouts ?? 0, 'garage payout', 'garage payouts')],
    [counts.bypassReports ?? 0, plural(counts.bypassReports ?? 0, '“book directly” report', '“book directly” reports')],
    [counts.requests ?? 0, plural(counts.requests ?? 0, 'visit request', 'visit requests')],
    [
      counts.teamTestPayments ?? 0,
      `${plural(counts.teamTestPayments ?? 0, 'real payment', 'real payments')} (refunded; kept in the money record)`,
    ],
    [
      counts.unrefundedPayments ?? 0,
      `${plural(counts.unrefundedPayments ?? 0, 'real payment', 'real payments')} (not refunded; kept in the money record)`,
    ],
    [
      counts.payoutLines ?? 0,
      `${plural(counts.payoutLines ?? 0, 'garage payout line', 'garage payout lines')} (the payout stays on record)`,
    ],
    [
      counts.removedPayoutLines ?? 0,
      `${plural(counts.removedPayoutLines ?? 0, 'garage payout line', 'garage payout lines')} (the payout is deleted; kept in the money record)`,
    ],
  ]
  return lines.filter(([n]) => n > 0).map(([, text]) => text)
}
