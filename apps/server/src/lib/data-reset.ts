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
  refundedAmount: string | null
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
 * A customer complaint made before the cutoff (0035). Complaints point at
 * bookings only loosely (ON DELETE SET NULL), so they are not part of any
 * chain: a cutoff run takes the ones made before the cutoff as a group of
 * their own, with one tick for all of them.
 */
export interface ResetComplaint {
  id: string
  /** The sequence number, printed C-000123. */
  number: number
  createdAt: Date
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
  only?: { chainIds: string[]; checkoutIds: string[]; complaints?: boolean } | null
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
   * when `only.complaints` says so. Absent (other scopes) is none.
   */
  complaints?: ResetComplaint[]
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

/** Where money landed on a chain: its payments and its paid bills. */
function chainMoneyItems(bookings: ResetBooking[], charges: ResetCharge[]): MoneyItem[] {
  const items: MoneyItem[] = []
  for (const booking of bookings) {
    const payment = booking.payment
    if (!payment || !MONEY_TAKEN.has(payment.status)) continue
    items.push({
      gatewayId: payment.gatewayTxnId,
      gatewayMode: payment.gatewayMode,
      cash: booking.paymentMethod === 'cash' || payment.status === 'collected',
    })
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
    detail: "Razorpay couldn't confirm this was a test payment, so it is treated as real.",
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
}

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
  scope: ResetScope
): KeptReason | null {
  if (!isDeletableMoney(money)) return money as KeptReason
  if (openOrder) return 'open_order'
  // A chain whose first booking is from before the cutoff but which changed
  // after it (moved to a new time by a customer who is now real) is kept
  // whole: a chain goes as a whole or not at all, and it may be real.
  if (scope.kind === 'before_cutoff' && chain.some((b) => b.createdAt >= scope.cutoff)) {
    return 'after_cutoff'
  }
  if (scope.kind === 'chains' && !chain.some((b) => b.markedTestAt !== null)) {
    return 'not_marked'
  }
  return null
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

      if (!keptNumbered && !keptUnnumbered) {
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
 * checkouts names those instead, and one with only complaints, those.
 */
export function confirmPhraseFor(
  counts: { bookings: number; checkouts: number; complaints?: number },
  checkoutsOnly: number
): string {
  if (counts.bookings > 0) {
    return `DELETE ${counts.bookings} ${counts.bookings === 1 ? 'BOOKING' : 'BOOKINGS'}`
  }
  const complaints = counts.complaints ?? 0
  if (checkoutsOnly === 0 && complaints > 0) {
    return `DELETE ${complaints} ${complaints === 1 ? 'COMPLAINT' : 'COMPLAINTS'}`
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

  return createHash('sha256')
    .update(
      JSON.stringify(
        complaints.length > 0 ? { chains, checkouts, receipts, complaints } : { chains, checkouts, receipts }
      )
    )
    .digest('hex')
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
      }
    : null
  const chargesByBooking = groupBy(input.charges, (charge) => charge.bookingId)
  const receiptByRoot = new Map(input.receipts.map((receipt) => [receipt.rootBookingId, receipt]))

  // ── Chains ──
  const chains: ChainPlan[] = []
  for (const [rootId, rows] of groupChains(input.bookings)) {
    if (!chainInScope(rootId, rows, scope)) continue
    const charges = rows.flatMap((b) => chargesByBooking.get(b.id) ?? [])
    const money = worst(chainMoneyItems(rows, charges).map((item) => classOf(item, input)))
    const latest = rows[rows.length - 1]
    const openOrder = hasOpenOrder(chainOpenOrders(rows, charges), input)
    const kept = keptReasonOf(money, openOrder, rows, scope)
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
      kept,
      selected: false,
    })
  }
  // Oldest first: the order the owner reads them in, and the order the cap
  // takes them in.
  chains.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.rootId.localeCompare(b.rootId))

  let overCapChains = 0
  let ticked = 0
  for (const chain of chains) {
    if (chain.kept) continue
    if (only && !only.chains.has(chain.rootId)) continue
    if (ticked >= MAX_CHAINS_PER_RUN) {
      overCapChains += 1
      continue
    }
    chain.selected = true
    ticked += 1
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
  const complaintsInScope =
    scope.kind === 'before_cutoff'
      ? (input.complaints ?? [])
          .filter((complaint) => complaint.createdAt < scope.cutoff)
          .sort((a, b) => a.number - b.number)
      : []
  const complaintsTicked = only ? only.complaints : true
  const selectedComplaintIds =
    complaintsTicked ? complaintsInScope.map((complaint) => complaint.id) : []

  // ── What that deletes ──
  const selectedChainIds = chains.filter((c) => c.selected).map((c) => c.rootId)
  const selectedRoots = new Set(selectedChainIds)
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
  }
  for (const root of selectedChainIds) counts.reschedules += input.reschedulesByChain.get(root) ?? 0
  for (const id of selectedIntentIds) {
    const child = input.intentChildCounts.get(id)
    counts.checkoutItems += child?.items ?? 0
    counts.refundRecords += child?.refundRecords ?? 0
  }
  counts.receiptNumbers = input.receipts.filter((r) => selectedRoots.has(r.rootBookingId)).length

  const receiptPlan = planReceipts({
    deletedRoots: selectedRoots,
    receipts: input.receipts,
    yearReceipts: input.yearReceipts,
    unnumberedReceipts: input.unnumberedReceipts,
    counters: input.counters,
    voidsByYear: input.voidsByYear,
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
    counts,
    receiptPlan,
    confirmPhrase: confirmPhraseFor(counts, selectedCheckoutIds.length),
    selectionHash: selectionHash({
      chains,
      checkouts,
      bookings: input.bookings,
      charges: input.charges,
      receiptPlan,
      complaintIds: selectedComplaintIds,
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
  ]
  return lines.filter(([n]) => n > 0).map(([, text]) => text)
}
