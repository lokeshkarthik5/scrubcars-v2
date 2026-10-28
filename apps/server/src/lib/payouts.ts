/**
 * Garage earnings and payouts: what each booking earns a garage, what Detlio
 * keeps, and what is still to pay.
 *
 * How the money moves: customers pay Detlio (Razorpay); Detlio pays each
 * garage its share by bank transfer or UPI, by hand, within 24 hours of the
 * job (PAYOUT_CYCLE_HOURS, agreed with the garages). Razorpay Route is not
 * used. Owner rules (16–17 Oct 2026), with the commission ones from
 * lib/commission.ts, which this file reuses rather than restates:
 *
 * - A booking earns the garage money when the job is completed, or when the
 *   customer didn't turn up and Detlio kept the payment (lib/earnings.ts).
 *   It becomes payable at that moment (`payableFrom`).
 * - The garage earns on the full price, before any promo Detlio pays for: a
 *   Detlio-funded promo is Detlio's cost. A garage-funded promo is money the
 *   garage gave away, so it comes off. A paid final bill (inspection jobs)
 *   is the rest of the work's price and is added.
 * - Detlio's commission: 8% on car wash, packages and others, 5% on
 *   detailing, coating and scratch removal, on that same full price, with
 *   the final bill at the main service's rate; nothing on each garage's
 *   first 25 bookings received (cancelled ones count towards the 25).
 * - Refunded money is not earned. A refund comes off the garage's figure in
 *   proportion to the garage's part of what the customer paid (so a full
 *   refund leaves nothing, whoever funded the promo), and the commission
 *   shrinks with it. A refund Razorpay failed moved no money and counts for
 *   nothing.
 * - Money the garage collected itself (cash, on bookings from before
 *   checkout went online-only) never reached Detlio: the garage already
 *   holds it, so it comes off what Detlio pays and the garage owes Detlio the
 *   commission on it, netted off the next payout.
 * - Bookings ops marked Test earn nothing: they are the team's own trials.
 *
 * Payouts settle bookings, never a loose amount. A booking's balance is what
 * it earns now less everything paid on it before (vendor_payout_items), so
 * it can never be paid twice, and a refund or a correction after a payout
 * shows as money owed back, taken off the next payout.
 *
 * Pure and clock-free: the caller reads the rows and passes `now`. Money is
 * rupee strings at rest and integer paise in here, as lib/refunds.ts and
 * lib/discounts.ts keep it.
 */
import type { ServiceCategory } from './categories.js'
import {
  COMMISSION_RATES,
  FREE_BOOKINGS,
  bookingCommission,
  mainCategory,
  moneyLanded,
  type CommissionItem,
} from './commission.js'
import { earningKind, type EarningKind } from './earnings.js'

/** Hours within which Detlio pays a garage for a booking (agreed with garages). */
export const PAYOUT_CYCLE_HOURS = 24

const HOUR_MS = 60 * 60 * 1000

function toPaise(amount: string | number | null | undefined): number {
  const value = Number(amount ?? 0)
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}

/** Paise as the rupee string the database and the API keep. */
export function paiseToRupees(paise: number): string {
  return (paise / 100).toFixed(2)
}

/** A refund recorded against the booking's payment or a paid final bill. */
export interface EarningRefund {
  amount: string
  /** refund_records.gateway_status: a failed refund moved no money. */
  gatewayStatus: 'pending' | 'processed' | 'failed' | null
}

/** A reschedule chain as earnings need it: its latest booking, with its money. */
export interface EarningChain {
  /** The chain's first booking: what payouts and receipts key it by. */
  rootId: string
  vendorId: string
  status: string
  noShow: 'customer' | 'garage' | null
  paymentMethod: 'online' | 'cash'
  paymentStatus: string | null
  /** The payment's running refund total (the no-show rule reads it). */
  paymentRefunded: string | null
  /** What the customer was charged at checkout, after any promo. */
  amount: string
  /** The price before any promo. */
  subtotalAmount: string
  discountFundedBy: 'platform' | 'vendor' | null
  items: CommissionItem[]
  /** Final bills paid in the app on the chain, added up. */
  billsPaid: string | null
  /** When the latest of those bills was paid. */
  lastBillPaidAt: Date | null
  /** Refunds on the chain's payment and its paid bills, failed ones too. */
  refunds: EarningRefund[]
  scheduledAt: Date
  completedAt: Date | null
  cancelledAt: Date | null
  noShowMarkedAt: Date | null
  markedTest: boolean
  /**
   * Detlio approved a refund instead of a free redo (0051): the job earns
   * nothing, so anything paid on it before is owed back. Optional so a
   * hand-built chain (tests) needs no change.
   */
  guaranteeRefund?: boolean
  /**
   * An accepted request's travel fee (customer reach, 0062), inside
   * `subtotalAmount`: earned in full, no commission. Optional: absent is none.
   */
  travelFee?: string | null
}

/** What one booking earns, in paise. */
export interface BookingEarning {
  /** Why it earns, or null when it earns nothing (any more). */
  kind: EarningKind | null
  /** Price before any promo, plus paid final bills (and any travel fee). */
  pricePaise: number
  /** An accepted request's travel fee, part of the price: the garage's whole, no commission (0062). */
  travelFeePaise: number
  /** A promo Detlio pays for: Detlio's cost, not the garage's. */
  detlioPromoPaise: number
  /** A promo the garage funded: comes off what it earns. */
  garagePromoPaise: number
  /** What the customer paid (checkout and final bills). */
  collectedPaise: number
  /** Standing refunds on it: money that went back to the customer. */
  refundsPaise: number
  /** The garage's part of those refunds. */
  refundSharePaise: number
  /** What commission is charged on: the full price, less the garage's part of refunds. */
  earnedPaise: number
  /** The rates that apply, highest first (one, or two on a mixed booking). */
  commissionRates: number[]
  commissionPaise: number
  /** Its place in the garage's first 25 when it is one of them: no commission. */
  freePosition: number | null
  /** The garage's share: earned less commission. */
  sharePaise: number
  /** Money the garage collected itself (cash). */
  heldByGaragePaise: number
  /** What Detlio owes the garage for it: share less what the garage holds. */
  duePaise: number
  /** When it became payable: the job completed, or the no-show recorded. */
  payableFrom: Date | null
}

const NOTHING: Omit<BookingEarning, 'kind' | 'payableFrom'> = {
  pricePaise: 0,
  travelFeePaise: 0,
  detlioPromoPaise: 0,
  garagePromoPaise: 0,
  collectedPaise: 0,
  refundsPaise: 0,
  refundSharePaise: 0,
  earnedPaise: 0,
  commissionRates: [],
  commissionPaise: 0,
  freePosition: null,
  sharePaise: 0,
  heldByGaragePaise: 0,
  duePaise: 0,
}

/** A refund that moved money: anything Razorpay did not fail. */
export function isStandingRefund(refund: EarningRefund): boolean {
  return refund.gatewayStatus !== 'failed'
}

/** Whether the garage, not Detlio, took the customer's money. */
export function collectedByGarage(chain: Pick<EarningChain, 'paymentMethod' | 'paymentStatus'>): boolean {
  return chain.paymentMethod === 'cash' || chain.paymentStatus === 'collected'
}

/**
 * When a booking became payable: when the job was completed (a final bill
 * paid later moves it to then), or when the no-show was recorded. Old rows
 * from before those times were kept fall back to the slot.
 */
export function payableFrom(
  chain: Pick<EarningChain, 'scheduledAt' | 'completedAt' | 'cancelledAt' | 'noShowMarkedAt' | 'lastBillPaidAt'>,
  kind: EarningKind
): Date {
  if (kind === 'customer_no_show') return chain.noShowMarkedAt ?? chain.cancelledAt ?? chain.scheduledAt
  const done = chain.completedAt ?? chain.scheduledAt
  return chain.lastBillPaidAt && chain.lastBillPaidAt > done ? chain.lastBillPaidAt : done
}

/** The rates a booking's commission is charged at, highest first. */
export function ratesOf(items: CommissionItem[], billPaise: number): number[] {
  const categories = new Set<ServiceCategory>(items.map((item) => item.category))
  const billCategory = mainCategory(items)
  if (billPaise > 0 && billCategory) categories.add(billCategory)
  return [...new Set([...categories].map((category) => COMMISSION_RATES[category]))].sort((a, b) => b - a)
}

/**
 * What one booking earns the garage. `position` is its place in the
 * garage's queue for the free 25 (lib/commission.ts queuePositions).
 */
export function bookingEarning(chain: EarningChain, position: number | undefined): BookingEarning {
  const kind = earningKind({
    status: chain.status,
    noShow: chain.noShow,
    payment: chain.paymentStatus
      ? { status: chain.paymentStatus, refundedAmount: chain.paymentRefunded }
      : null,
    guaranteeRefund: chain.guaranteeRefund,
  })
  // Nothing earned: not done yet, cancelled, a garage no-show, never paid
  // for, or a Test booking.
  if (!kind || chain.markedTest || !moneyLanded(chain.paymentStatus)) {
    return { kind: null, payableFrom: null, ...NOTHING }
  }

  const subtotal = toPaise(chain.subtotalAmount)
  const charged = toPaise(chain.amount)
  const promo = Math.max(0, subtotal - charged)
  const bills = toPaise(chain.billsPaid)
  const detlioPromo = chain.discountFundedBy === 'platform' ? promo : 0
  const garagePromo = chain.discountFundedBy === 'platform' ? 0 : promo
  const price = subtotal + bills
  // The full price the garage earns on: before Detlio's promo, after its own.
  const base = price - garagePromo
  const collected = charged + bills

  const refunds = Math.min(
    collected,
    chain.refunds.filter(isStandingRefund).reduce((sum, refund) => sum + toPaise(refund.amount), 0)
  )
  // The garage's part of what went back: all of it, unless Detlio paid for
  // part of the price, when Detlio's part of the refund is Detlio's.
  const refundShare = collected > 0 ? Math.min(base, Math.round((refunds * base) / collected)) : 0
  const earned = base - refundShare

  const free = position !== undefined && position <= FREE_BOOKINGS
  const full = free
    ? 0
    : Math.round(
        bookingCommission({
          status: chain.status,
          noShow: chain.noShow,
          paymentStatus: chain.paymentStatus,
          paymentRefunded: chain.paymentRefunded,
          amount: chain.amount,
          subtotalAmount: chain.subtotalAmount,
          discountFundedBy: chain.discountFundedBy,
          // Payouts charge the category rates: a service's own rate (0064)
          // is for Statistics only (owner, 28 Oct 2026), so it is dropped.
          items: chain.items.map((item) => ({ ...item, overrideRate: null })),
          billsPaid: chain.billsPaid,
          travelFee: chain.travelFee,
        }) * 100
      )
  // Refunded money is not earned, so it carries no commission either.
  const commission = base > 0 ? Math.round((full * earned) / base) : 0
  const share = earned - commission
  const held = collectedByGarage(chain) ? charged : 0

  return {
    kind,
    pricePaise: price,
    travelFeePaise: toPaise(chain.travelFee),
    detlioPromoPaise: detlioPromo,
    garagePromoPaise: garagePromo,
    collectedPaise: collected,
    refundsPaise: refunds,
    refundSharePaise: refundShare,
    earnedPaise: earned,
    commissionRates: free ? [] : ratesOf(chain.items, bills),
    commissionPaise: commission,
    freePosition: free ? position : null,
    sharePaise: share,
    heldByGaragePaise: held,
    duePaise: share - held,
    payableFrom: payableFrom(chain, kind),
  }
}

// ─── Balances ────────────────────────────────────────────────────────────────

/** What one earlier payout paid on a booking. */
export interface SettledPart {
  payoutId: string
  amountPaise: number
  reference: string
  paidAt: Date
}

/**
 * Where a booking stands with Detlio:
 *
 * - `due`: Detlio owes the garage money on it now.
 * - `owed_back`: the garage owes Detlio (a refund after a payout, or the
 *   commission on cash it collected); taken off the next payout.
 * - `paid`: everything it earned has been paid.
 * - `nothing_due`: it earned nothing to pay (a free booking paid in cash, or
 *   one fully refunded before any payout).
 */
export type BalanceStatus = 'due' | 'owed_back' | 'paid' | 'nothing_due'

export interface BookingBalance {
  /** Paid on it so far, by every payout. */
  settledPaise: number
  /** Still to settle: positive owed to the garage, negative owed to Detlio. */
  balancePaise: number
  status: BalanceStatus
}

export function bookingBalance(earning: Pick<BookingEarning, 'duePaise'>, settled: SettledPart[]): BookingBalance {
  const settledPaise = settled.reduce((sum, part) => sum + part.amountPaise, 0)
  const balancePaise = earning.duePaise - settledPaise
  const status: BalanceStatus =
    balancePaise > 0 ? 'due' : balancePaise < 0 ? 'owed_back' : settledPaise !== 0 ? 'paid' : 'nothing_due'
  return { settledPaise, balancePaise, status }
}

/** A booking's line on a statement: its earning, its balance and its payouts. */
export interface StatementLine {
  rootId: string
  earning: BookingEarning
  balance: BookingBalance
  settled: SettledPart[]
  /**
   * When it became payable, for a line that earns nothing now but was paid
   * on before (the item being taken back): the earlier payout's date.
   */
  payableFrom: Date
}

/**
 * Every booking worth a line: one that earns, or one paid on before (whose
 * money may now be owed back). Lines with neither are left out.
 */
export function statementLines(
  chains: EarningChain[],
  positions: Map<string, number>,
  settledByRoot: Map<string, SettledPart[]>
): StatementLine[] {
  const lines: StatementLine[] = []
  for (const chain of chains) {
    const earning = bookingEarning(chain, positions.get(chain.rootId))
    const settled = settledByRoot.get(chain.rootId) ?? []
    if (!earning.kind && settled.length === 0) continue
    const balance = bookingBalance(earning, settled)
    const at =
      earning.payableFrom ??
      settled.reduce<Date | null>((first, part) => (!first || part.paidAt < first ? part.paidAt : first), null) ??
      chain.scheduledAt
    lines.push({ rootId: chain.rootId, earning, balance, settled, payableFrom: at })
  }
  return lines.sort((a, b) => b.payableFrom.getTime() - a.payableFrom.getTime() || (a.rootId < b.rootId ? -1 : 1))
}

/** The lines a payout recorded at `upTo` settles: every one with a balance, payable by then. */
export function payableLines(lines: StatementLine[], upTo: Date): StatementLine[] {
  return lines.filter((line) => line.balance.balancePaise !== 0 && line.payableFrom <= upTo)
}

/** A garage's balance with Detlio, as the Payouts list and the Earnings screen open on. */
export interface BalanceSummary {
  /** Net owed to the garage now: negative when the garage owes Detlio. */
  balancePaise: number
  /** Bookings with money still to settle. */
  bookings: number
  /** The oldest booking Detlio still owes money on. */
  oldestUnpaidAt: Date | null
  /** Older than the 24-hour cycle. */
  overdue: boolean
}

export function summariseBalance(lines: StatementLine[], now: Date): BalanceSummary {
  const open = payableLines(lines, now)
  const owed = open.filter((line) => line.balance.balancePaise > 0)
  const oldest = owed.reduce<Date | null>(
    (first, line) => (!first || line.payableFrom < first ? line.payableFrom : first),
    null
  )
  const balancePaise = open.reduce((sum, line) => sum + line.balance.balancePaise, 0)
  return {
    balancePaise,
    bookings: open.length,
    oldestUnpaidAt: oldest,
    overdue: balancePaise > 0 && isOverdue(oldest, now),
  }
}

/** Unpaid for longer than the payout cycle. */
export function isOverdue(oldestUnpaidAt: Date | null, now: Date): boolean {
  return oldestUnpaidAt !== null && now.getTime() - oldestUnpaidAt.getTime() > PAYOUT_CYCLE_HOURS * HOUR_MS
}

/**
 * What recording a payout now would pay, or why it can't: the lines it
 * covers, their total, and the period covered. Refused when the total
 * Detlio owes is not more than zero (the garage owes Detlio, or nothing is
 * due): money owed back waits for the next payout.
 */
export type PayoutPlan =
  | { ok: true; lines: StatementLine[]; amountPaise: number; coversFrom: Date; coversUpTo: Date }
  | { ok: false; reason: 'nothing_due' | 'owed_back' }

export function planPayout(lines: StatementLine[], upTo: Date): PayoutPlan {
  const covered = payableLines(lines, upTo)
  const amountPaise = covered.reduce((sum, line) => sum + line.balance.balancePaise, 0)
  if (covered.length === 0 || amountPaise === 0) return { ok: false, reason: 'nothing_due' }
  if (amountPaise < 0) return { ok: false, reason: 'owed_back' }
  const coversFrom = covered.reduce((first, line) => (line.payableFrom < first ? line.payableFrom : first), upTo)
  return { ok: true, lines: covered, amountPaise, coversFrom, coversUpTo: upTo }
}

// ─── Payout details ──────────────────────────────────────────────────────────

/** Four letters, a zero, then six letters or digits (0038's CHECK). */
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/
/** Indian bank account numbers: 9 to 18 digits. */
export const ACCOUNT_NUMBER_PATTERN = /^[0-9]{9,18}$/
/** name@handle, as 0038's CHECK has it. */
export const UPI_ID_PATTERN = /^[A-Za-z0-9._-]{2,}@[A-Za-z][A-Za-z0-9.-]+$/

/** "••••1234": the last four digits only, as every list shows an account. */
export function maskAccountNumber(number: string): string {
  return `••••${number.slice(-4)}`
}

/** "ra•••@okaxis": enough to recognise, not enough to copy. */
export function maskUpiId(upiId: string): string {
  const [name, handle] = upiId.split('@')
  return `${name.slice(0, 2)}•••@${handle ?? ''}`
}

/** How a garage is paid, masked, for lists: bank first when both are set. */
export function maskedAccount(account: { accountNumber: string | null; upiId: string | null } | null):
  | { method: 'bank' | 'upi'; masked: string }
  | null {
  if (account?.accountNumber) return { method: 'bank', masked: maskAccountNumber(account.accountNumber) }
  if (account?.upiId) return { method: 'upi', masked: maskUpiId(account.upiId) }
  return null
}

/** The customer as a garage's statement names them: the first name only. */
export function firstNameOf(name: string | null | undefined): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? ''
  // "R. Uday": an initial is not a name to read out.
  const named = (name ?? '').trim().split(/\s+/).find((part) => part.replace(/\./g, '').length > 1)
  return (named ?? first) || 'Customer'
}
