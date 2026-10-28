/**
 * "Not in your area yet" (customer reach, part 2, 0062): the free-wash
 * sign-up's numbers and words for the customer app, and the rule for when
 * its card comes back after it was closed. The server's rules are
 * apps/server/src/lib/area-signups.ts; the numbers here are held equal to it
 * by area-signups.parity.test.ts.
 */

export const FREE_WASH_RULES = {
  perZone: 50,
  maxRupees: 499,
  validDays: 30,
  honestCountFrom: 10,
  /** Closed with ×: back after this many days… */
  closedForDays: 7,
  /** …at most this many times. */
  maxCloses: 3,
} as const

/** PLACEHOLDER: owner to confirm (₹100 a garage, ₹500 at most a customer). */
export const REFERRAL_CREDIT = {
  perGarageRupees: 100,
  maxPerCustomerRupees: 500,
} as const

const DAY_MS = 24 * 60 * 60 * 1000

// ─── The card's ×, kept on the phone per area ────────────────────────────────

/** What the phone remembers about the free-wash card for one area. */
export interface CardCloses {
  /** How many times it was closed. */
  count: number
  /** When it was last closed (ms). */
  lastAt: number
}

/** The localStorage key for an area's closes. */
export function cardClosesKey(zoneSlug: string): string {
  return `detlio:free-wash-closed:${zoneSlug}`
}

/**
 * Whether the card shows: never closed; or closed fewer than 3 times and
 * 7 days have passed since the last. Closed 3 times: it does not come back.
 */
export function freeWashCardVisible(closes: CardCloses | null, now: number): boolean {
  if (!closes || closes.count <= 0) return true
  if (closes.count >= FREE_WASH_RULES.maxCloses) return false
  return now - closes.lastAt >= FREE_WASH_RULES.closedForDays * DAY_MS
}

/** The record after one more ×. */
export function closeOnce(closes: CardCloses | null, now: number): CardCloses {
  return { count: (closes?.count ?? 0) + 1, lastAt: now }
}

/** Reads an area's closes from storage; null when none or unreadable. */
export function parseCardCloses(raw: string | null): CardCloses | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<CardCloses>
    if (typeof value.count !== 'number' || typeof value.lastAt !== 'number') return null
    return { count: value.count, lastAt: value.lastAt }
  } catch {
    return null
  }
}

// ─── Words ───────────────────────────────────────────────────────────────────

/** "Free wash when we reach Velachery". */
export function freeWashCardTitle(area: string): string {
  return `Free wash when we reach ${area}`
}

/**
 * The honest count: "24 waiting here" from 10 sign-ups, otherwise "Be the
 * first in Velachery".
 */
export function waitingLine(area: string, waiting: number | null | undefined): string {
  return waiting != null && waiting >= FREE_WASH_RULES.honestCountFrom
    ? `${waiting} waiting here`
    : `Be the first in ${area}`
}

/** Whether the area's free washes are all given: the sheet then offers "Notify me" only. */
export function freeWashesGone(freeWashesLeft: number | null | undefined): boolean {
  return freeWashesLeft === 0
}

/** The recommend ask, right after signing up. */
export function recommendAsk(): string {
  return `Know a good garage here? ₹${REFERRAL_CREDIT.perGarageRupees} credit if they join and you book them`
}
