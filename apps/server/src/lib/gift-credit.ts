/**
 * Gift a wash (0049): Detlio gifts and the Detlio credit they turn into, as
 * pure rules. Everything that decides money lives here and is unit-tested;
 * the gifts module only reads rows, takes locks and writes what this says.
 *
 * Behind GIFTS_ENABLED (default off) until the owner's lawyer/CA confirms
 * the structure: see the lawyer notes in apps/users/lib/legal/gifts.ts.
 *
 * The rules (defaults chosen for the pilot, written down in AGENTS.md):
 *
 *   - A signed-in customer buys a gift of ₹500, ₹1,000 or ₹2,000, or any
 *     whole amount from ₹300 to ₹5,000, paid through Razorpay. At most
 *     ₹10,000 of gifts per buyer per IST day.
 *   - The buyer gets a link (/gift/<code>) to share. The code is 16
 *     characters from an alphabet with no look-alikes (no 0/O, 1/I/L), about
 *     79 bits: guessing one is hopeless, and attempts are rate limited too.
 *     Only its SHA-256 is stored, so the buyer can't see an old code again:
 *     "Get the link" makes a new code and the old one stops working.
 *   - Whoever opens the link and is signed in can redeem it once: its value
 *     becomes Detlio credit on their account. The buyer may redeem their own
 *     gift (simplest, and harmless: it is their money).
 *   - Gift and credit expire 12 months after the gift was paid for. Credit
 *     that comes back from a cancelled booking keeps the latest expiry of the
 *     credit it was paid with, but never less than 30 days from its return.
 *   - Credit is spent oldest-expiry first, at checkout, after any promo
 *     code. If it covers the whole booking, no Razorpay order is opened;
 *     otherwise Razorpay takes the rest, never less than ₹1 (Razorpay's
 *     minimum), so a balance that would leave under ₹1 to pay is used up to
 *     price − ₹1.
 *
 * The ledger (gift_credit_entries) is a list of lots and draws. A lot is a
 * positive entry with an expiry: a redeemed gift (`redeem`), credit given
 * back from a booking (`refund`), a positive `adjustment` by the team, or a
 * reward for a confirmed bypass report (`report_reward`, 0052). A
 * draw is a negative entry naming the lot it came from: a booking paid with
 * credit (`debit`, one row per lot), a negative `adjustment`, or an
 * `expiry` that writes off what a lot had left when it ran out. A lot's
 * remainder is its amount plus its draws; the balance is the remainders of
 * the lots not yet expired. Every write happens under the customer's
 * credit lock (`gift-credit:<userId>`), so two checkouts can never both
 * spend the same rupee.
 *
 * Money is integer paise in here and rupee strings at rest, like
 * lib/refunds.ts. Clock-free: every caller passes `now`.
 */
import { createHash, randomInt } from 'node:crypto'

// ─── Amounts and limits ──────────────────────────────────────────────────────

/** The three amounts offered as buttons, in rupees. */
export const GIFT_PRESET_AMOUNTS = [500, 1000, 2000] as const
/** A custom amount: whole rupees from ₹300 to ₹5,000. */
export const GIFT_MIN_AMOUNT = 300
export const GIFT_MAX_AMOUNT = 5000
/** The most one buyer may spend on gifts in an IST day, in rupees. */
export const GIFT_DAILY_LIMIT = 10000
/** How long a gift, and the credit it becomes, lasts after it was paid for. */
export const GIFT_VALID_MONTHS = 12
/** Credit given back from a cancelled booking lasts at least this long. */
export const RETURNED_CREDIT_MIN_DAYS = 30
/** "Expiring soon" on the admin page and the customer's credit screen. */
export const EXPIRING_SOON_DAYS = 30
/** How long a buyer has to pay for a gift; like a booking checkout's. */
export const GIFT_CHECKOUT_MINUTES = 30
/** Razorpay's smallest order: a part payment never leaves less than this. */
export const MIN_GATEWAY_PAISE = 100

/**
 * Every card design `gifts.design` may hold (0055 widened the CHECK). `fresh`
 * is the 0049 name of what is now Pearl: kept for rows bought before 0055,
 * never stored again.
 */
export const GIFT_DESIGNS = ['shine', 'midnight', 'fresh', 'pearl', 'birthday', 'diwali', 'thank_you'] as const
export type GiftDesign = (typeof GIFT_DESIGNS)[number]

/** The designs a buyer may pick, in the order the app shows them. */
export const GIFT_BUY_DESIGNS = ['shine', 'midnight', 'pearl', 'birthday', 'diwali', 'thank_you'] as const satisfies readonly GiftDesign[]
export type GiftBuyDesign = (typeof GIFT_BUY_DESIGNS)[number]

/**
 * The design a purchase stores. An app from before 0055 still sends `fresh`
 * for Pearl; it is stored as `pearl`, so new rows never hold `fresh`.
 */
export function giftDesignToStore(design: GiftBuyDesign | 'fresh'): GiftBuyDesign {
  return design === 'fresh' ? 'pearl' : design
}

export const GIFT_STATUSES = ['pending', 'paid', 'redeemed', 'cancelled'] as const
/** As stored: pending until Razorpay says paid, then redeemed once, or cancelled by the team. */
export type GiftStatus = (typeof GIFT_STATUSES)[number]

// `report_reward` (0052): a lot of ₹100 for a bypass report Detlio confirmed
// (lib/bypass-reports.ts), Detlio's own money, not a gift's.
export const CREDIT_ENTRY_KINDS = ['redeem', 'debit', 'refund', 'expiry', 'adjustment', 'report_reward'] as const
export type CreditEntryKind = (typeof CREDIT_ENTRY_KINDS)[number]

const DAY_MS = 24 * 60 * 60 * 1000

export function paise(amount: string | number | null | undefined): number {
  const value = Number(amount ?? 0)
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}

export function rupees(paiseValue: number): string {
  return (paiseValue / 100).toFixed(2)
}

/** Why a gift amount can't be bought, or null when it can. */
export function giftAmountRefusal(amount: number): 'not_whole_rupees' | 'too_small' | 'too_large' | null {
  if (!Number.isInteger(amount)) return 'not_whole_rupees'
  if (amount < GIFT_MIN_AMOUNT) return 'too_small'
  if (amount > GIFT_MAX_AMOUNT) return 'too_large'
  return null
}

/**
 * Whether one more gift of `amount` stays within the buyer's day: what they
 * bought today (paid, redeemed or cancelled since, and checkouts still open)
 * plus this one, at most GIFT_DAILY_LIMIT. Inclusive: a day may reach it.
 */
export function withinDailyLimit(input: { boughtTodayPaise: number; amount: number; limit?: number }): boolean {
  return input.boughtTodayPaise + input.amount * 100 <= (input.limit ?? GIFT_DAILY_LIMIT) * 100
}

/** What is left of the buyer's day, in rupees, for the error message. */
export function dailyLimitLeft(boughtTodayPaise: number, limit = GIFT_DAILY_LIMIT): number {
  return Math.max(0, Math.floor((limit * 100 - boughtTodayPaise) / 100))
}

// ─── Codes ───────────────────────────────────────────────────────────────────

/**
 * 31 characters with no look-alikes: no 0/O, no 1/I/L. Upper case only; a
 * typed code is upper-cased before it is checked.
 */
export const GIFT_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const GIFT_CODE_LENGTH = 16

/** A fresh code, from crypto.randomInt (uniform, no modulo bias). */
export function newGiftCode(pick: (max: number) => number = randomInt): string {
  let code = ''
  for (let i = 0; i < GIFT_CODE_LENGTH; i += 1) code += GIFT_CODE_ALPHABET[pick(GIFT_CODE_ALPHABET.length)]
  return code
}

/** "ABCD-EFGH-JKMN-PQRS": how a code is printed and read out. */
export function formatGiftCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code
}

/**
 * A typed or linked code as stored: spaces and dashes dropped, upper case.
 * Null when it can't be one (wrong length, a character not in the
 * alphabet), so a typo never costs a database read or an attempt.
 */
export function normalizeGiftCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, '').toUpperCase()
  if (code.length !== GIFT_CODE_LENGTH) return null
  for (const char of code) if (!GIFT_CODE_ALPHABET.includes(char)) return null
  return code
}

/**
 * What is stored for a code: its SHA-256, hex. No key is needed: with about
 * 79 bits in the code, nobody can work back from the hash, and a keyed hash
 * would make every gift unreadable the day the key changed.
 */
export function giftCodeHash(code: string): string {
  return createHash('sha256').update(`detlio-gift:${code}`).digest('hex')
}

// ─── Dates ───────────────────────────────────────────────────────────────────

/** 12 calendar months after `from` (the same day and time, a year on). */
export function giftExpiresAt(from: Date): Date {
  const at = new Date(from.getTime())
  at.setUTCMonth(at.getUTCMonth() + GIFT_VALID_MONTHS)
  return at
}

/**
 * The expiry of credit given back from a cancelled booking: the latest
 * expiry of the lots it was paid from, or RETURNED_CREDIT_MIN_DAYS from now
 * if that is later (credit that had nearly run out, or had, is not lost to
 * a cancellation the customer may not have chosen).
 */
export function returnedCreditExpiresAt(lotExpiries: readonly Date[], now: Date): Date {
  const floor = now.getTime() + RETURNED_CREDIT_MIN_DAYS * DAY_MS
  const latest = lotExpiries.reduce((max, at) => Math.max(max, at.getTime()), 0)
  return new Date(Math.max(floor, latest))
}

// ─── Gifts ───────────────────────────────────────────────────────────────────

export interface GiftForRules {
  status: GiftStatus
  expiresAt: Date | null
}

/** What a gift is now, as the buyer, the recipient and admin read it. */
export type GiftState = 'pending' | 'available' | 'redeemed' | 'expired' | 'cancelled'

export function giftState(gift: GiftForRules, now: Date): GiftState {
  if (gift.status === 'paid') {
    return gift.expiresAt && gift.expiresAt.getTime() <= now.getTime() ? 'expired' : 'available'
  }
  return gift.status
}

/** Why a gift can't be redeemed now, or null when it can. */
export function redeemRefusal(gift: GiftForRules, now: Date): Exclude<GiftState, 'available'> | null {
  const state = giftState(gift, now)
  return state === 'available' ? null : state
}

/** Whether the buyer may get a (new) link: only while it can still be redeemed. */
export function canIssueLink(gift: GiftForRules, now: Date): boolean {
  return giftState(gift, now) === 'available'
}

// ─── The ledger ──────────────────────────────────────────────────────────────

/** One gift_credit_entries row, as the rules need it. */
export interface CreditEntry {
  id: string
  kind: CreditEntryKind
  /** Signed rupees: a lot is positive, a draw negative. */
  amount: string
  /** The lot a draw came from; null on a lot. */
  lotId: string | null
  /** A lot's expiry; null on a draw. */
  expiresAt: Date | null
  createdAt: Date
}

export interface CreditLot {
  id: string
  kind: CreditEntryKind
  amountPaise: number
  remainingPaise: number
  expiresAt: Date
  createdAt: Date
  expired: boolean
}

/** Every lot with what is left of it, oldest expiry first (then oldest made). */
export function lotsOf(entries: readonly CreditEntry[], now: Date): CreditLot[] {
  const lots = new Map<string, CreditLot>()
  for (const entry of entries) {
    if (entry.lotId !== null || !entry.expiresAt) continue
    const amountPaise = paise(entry.amount)
    lots.set(entry.id, {
      id: entry.id,
      kind: entry.kind,
      amountPaise,
      remainingPaise: amountPaise,
      expiresAt: entry.expiresAt,
      createdAt: entry.createdAt,
      expired: entry.expiresAt.getTime() <= now.getTime(),
    })
  }
  for (const entry of entries) {
    if (entry.lotId === null) continue
    const lot = lots.get(entry.lotId)
    if (lot) lot.remainingPaise += paise(entry.amount)
  }
  return [...lots.values()].sort(
    (a, b) => a.expiresAt.getTime() - b.expiresAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime()
  )
}

/** What can be spent now: the remainders of the lots not yet expired. */
export function balanceOf(entries: readonly CreditEntry[], now: Date): number {
  return lotsOf(entries, now)
    .filter((lot) => !lot.expired)
    .reduce((sum, lot) => sum + Math.max(0, lot.remainingPaise), 0)
}

/** The credit that runs out first, and when: for "₹500 expires on 12 Oct 2027". */
export function nextExpiry(entries: readonly CreditEntry[], now: Date): { paise: number; at: Date } | null {
  const lot = lotsOf(entries, now).find((candidate) => !candidate.expired && candidate.remainingPaise > 0)
  return lot ? { paise: lot.remainingPaise, at: lot.expiresAt } : null
}

/** Credit that runs out within `days` of now (the lots, added up). */
export function expiringWithin(entries: readonly CreditEntry[], now: Date, days = EXPIRING_SOON_DAYS): number {
  const by = now.getTime() + days * DAY_MS
  return lotsOf(entries, now)
    .filter((lot) => !lot.expired && lot.remainingPaise > 0 && lot.expiresAt.getTime() <= by)
    .reduce((sum, lot) => sum + lot.remainingPaise, 0)
}

/**
 * Which lots pay for `amountPaise`, oldest expiry first: one draw per lot.
 * Null when the balance doesn't cover it (nothing is drawn at all: a
 * booking is paid with the credit it was priced with, or not at all).
 */
export function planDraw(
  entries: readonly CreditEntry[],
  amountPaise: number,
  now: Date
): Array<{ lotId: string; paise: number }> | null {
  if (amountPaise <= 0) return []
  const draws: Array<{ lotId: string; paise: number }> = []
  let left = amountPaise
  for (const lot of lotsOf(entries, now)) {
    if (lot.expired || lot.remainingPaise <= 0) continue
    const take = Math.min(lot.remainingPaise, left)
    draws.push({ lotId: lot.id, paise: take })
    left -= take
    if (left === 0) return draws
  }
  return null
}

/** The expiry entries a sweep writes: each expired lot's remainder, written off. */
export function expiredRemainders(entries: readonly CreditEntry[], now: Date): Array<{ lotId: string; paise: number }> {
  return lotsOf(entries, now)
    .filter((lot) => lot.expired && lot.remainingPaise > 0)
    .map((lot) => ({ lotId: lot.id, paise: lot.remainingPaise }))
}

// ─── Checkout ────────────────────────────────────────────────────────────────

/**
 * How much credit pays for a booking that costs `chargePaise` after any
 * promo, from a balance of `balancePaise`: all of it if the balance covers
 * it (no Razorpay order at all); otherwise as much as leaves Razorpay at
 * least ₹1 to take (MIN_GATEWAY_PAISE), which may be nothing.
 */
export function creditToUse(chargePaise: number, balancePaise: number): number {
  if (chargePaise <= 0 || balancePaise <= 0) return 0
  if (balancePaise >= chargePaise) return chargePaise
  const cash = chargePaise - balancePaise
  if (cash >= MIN_GATEWAY_PAISE) return balancePaise
  return Math.max(0, chargePaise - MIN_GATEWAY_PAISE)
}

/**
 * A checkout's price after any promo, split into the credit it uses and
 * what Razorpay is asked for. The booking then costs the two together.
 */
export function splitCheckout(chargePaise: number, balancePaise: number): { creditPaise: number; cashPaise: number } {
  const creditPaise = creditToUse(chargePaise, balancePaise)
  return { creditPaise, cashPaise: chargePaise - creditPaise }
}

/** A payment's money, split: what came through Razorpay and what from credit. */
export interface PaymentSplit {
  /** payments.amount: what Razorpay took (0.00 on a booking paid wholly with credit). */
  amount: string
  /** payments.credit_amount: what Detlio credit paid. */
  creditAmount?: string | null
  creditReturnedAt?: Date | null
}

/** What the booking cost the customer in all: Razorpay's part plus credit's. */
export function paidInAll(payment: PaymentSplit): string {
  return rupees(paise(payment.amount) + paise(payment.creditAmount))
}

/**
 * Whether a payment's credit part is still to go back to the customer's
 * credit: there is some, and it hasn't. The caller has already decided the
 * booking's money is owed back (lib/refunds.ts isBookingPaymentRefundable).
 */
export function creditStillToReturn(payment: PaymentSplit): boolean {
  return paise(payment.creditAmount) > 0 && !payment.creditReturnedAt
}

// ─── Redemption attempts ─────────────────────────────────────────────────────

/** Wrong codes allowed per signed-in customer per hour, before 429. */
export const REDEEM_FAILURES_PER_USER_HOUR = 10
/** Wrong codes allowed per network address per hour (lookups and redeems), before 429. */
export const CODE_FAILURES_PER_IP_HOUR = 30

/** Whether another code may be tried, from the wrong ones in the last hour. */
export function codeAttemptAllowed(input: { userFailures: number | null; ipFailures: number }): boolean {
  if (input.userFailures !== null && input.userFailures >= REDEEM_FAILURES_PER_USER_HOUR) return false
  return input.ipFailures < CODE_FAILURES_PER_IP_HOUR
}

/**
 * A network address as it is kept for counting wrong codes: hashed, so the
 * attempts table never holds an IP address.
 */
export function ipKey(ip: string): string {
  return createHash('sha256').update(`detlio-gift-ip:${ip}`).digest('hex').slice(0, 32)
}

// ─── Admin adjustments ───────────────────────────────────────────────────────

/** The largest single adjustment the team may make, in rupees. */
export const MAX_ADJUSTMENT = 10000

/** Why a manual adjustment can't be made, or null when it can. */
export function adjustmentRefusal(input: { amountPaise: number; balancePaise: number }): 'zero' | 'too_large' | 'over_balance' | null {
  if (input.amountPaise === 0) return 'zero'
  if (Math.abs(input.amountPaise) > MAX_ADJUSTMENT * 100) return 'too_large'
  if (input.amountPaise < 0 && -input.amountPaise > input.balancePaise) return 'over_balance'
  return null
}
