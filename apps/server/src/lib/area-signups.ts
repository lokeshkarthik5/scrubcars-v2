/**
 * "Not in your area yet" (customer reach, part 2, 0062): the free-wash
 * sign-up, launch day, the come-back messages and the referral credit for
 * recommending a garage.
 *
 * - A customer whose area (zone, lib/zones.ts) has no live garage, at any
 *   distance, can put their name down for it, once per zone. The first 50
 *   of a zone get a free wash when Detlio arrives; after that it is "Notify
 *   me" only.
 * - A zone goes live when the first garage customers can find has its pin
 *   in it: `zones.live_at` is set once (a conditional update), the free
 *   washes are issued to that zone's first 50 in the same transaction, and
 *   each sign-up is told once.
 * - The free wash is a Detlio-funded promo code (discounts.source
 *   'free_wash'): up to ₹499 off one car-wash service, the customer paying
 *   anything above, valid 30 days from the zone's launch. The garage is paid
 *   the full price, as for any Detlio-funded code.
 * - Recommending a garage earns ₹100 of Detlio credit when the team links
 *   it to a garage that goes live and the customer completes a paid booking
 *   there: once per garage, ₹500 at most per customer.
 *
 * Pure, so every rule is unit-tested (area-signups.test.ts). Words and
 * numbers the app needs are twinned in packages/core/src/area-signups.ts
 * (area-signups.parity.test.ts).
 */
import { computeDiscount, rupeesToPaise, paiseToRupees } from './discounts.js'
import { istParts } from './ist.js'

const DAY_MS = 24 * 60 * 60 * 1000

/** Every number of the free wash and the sign-up in one place. */
export const FREE_WASH_RULES = {
  /** The first this many sign-ups of a zone get the free wash. */
  perZone: 50,
  /** At most this much off, in rupees. */
  maxRupees: 499,
  /** Valid this many days from the zone's launch. */
  validDays: 30,
  /** The one kind of service it is for. */
  category: 'car_wash' as const,
  /** "N waiting here" only once a zone has this many sign-ups; "Be the first" below. */
  honestCountFrom: 10,
  /** Closed with ×: back after this many days… */
  closedForDays: 7,
  /** …at most this many times. */
  maxCloses: 3,
  /** No change for this many days: one "nearest options" reminder, then nothing. */
  reminderAfterDays: 14,
} as const

/**
 * The referral credit for a recommended garage.
 * PLACEHOLDER: owner to confirm (₹100 a garage, ₹500 at most a customer;
 * ADMIN-FIXES-BACKLOG "Needed from you").
 */
export const REFERRAL_CREDIT = {
  perGarageRupees: 100,
  maxPerCustomerRupees: 500,
} as const

// ─── Signing up ──────────────────────────────────────────────────────────────

/** What a sign-up gets, from its place in the zone's list (1 is the first). */
export function signupOffer(position: number): { freeWash: boolean } {
  return { freeWash: position >= 1 && position <= FREE_WASH_RULES.perZone }
}

/**
 * Whether Detlio is in a zone, for the free-wash list: a listed garage's pin
 * is in it now, or it has launched (`live_at`, set once and never cleared) and
 * lost its garage since. Either way there is no list to join: `GET /zones`
 * says `hasGarage` and the sign-up refuses with AREA_LIVE, the same answer.
 */
export function zoneIsLive(zone: { liveAt: Date | null }, garageThereNow: boolean): boolean {
  return garageThereNow || zone.liveAt !== null
}

export type SignupRefusal = 'ZONE_LIVE' | 'ALREADY_SIGNED_UP'

/** Why a sign-up can't be taken: the zone already has a garage, or they are on its list. */
export function signupRefusal(input: { zoneLive: boolean; alreadySignedUp: boolean }): SignupRefusal | null {
  if (input.zoneLive) return 'ZONE_LIVE'
  if (input.alreadySignedUp) return 'ALREADY_SIGNED_UP'
  return null
}

/**
 * The honest count: "N waiting here" only from 10 sign-ups, otherwise "Be
 * the first in <Area>" (null count).
 */
export function waitingCount(signups: number): number | null {
  return signups >= FREE_WASH_RULES.honestCountFrom ? signups : null
}

/** Free washes still to give in a zone. */
export function freeWashesLeft(signups: number): number {
  return Math.max(0, FREE_WASH_RULES.perZone - signups)
}

// ─── The free wash's money ───────────────────────────────────────────────────

/**
 * What the free wash takes off a booking: up to ₹499 off the dearest single
 * car-wash line (one service, not every car wash in the cart), never more
 * than that line. Free means free: a ₹299 wash alone costs ₹0, and a
 * booking that comes to ₹0 is booked with no payment at all (no Razorpay
 * order; booking-intents.service). Unlike every other code it has no ₹1
 * floor. Null when the booking has no car wash. Through computeDiscount,
 * the one place discount money is worked out.
 */
export function freeWashDiscount(
  lines: ReadonlyArray<{ category: string; amount: string }>,
  subtotal: string
): { discountAmount: string; finalAmount: string; eligibleLine: string } | null {
  const washes = lines.filter((line) => line.category === FREE_WASH_RULES.category)
  if (washes.length === 0) return null
  const dearest = washes.reduce((max, line) => (rupeesToPaise(line.amount) > rupeesToPaise(max) ? line.amount : max), washes[0]!.amount)
  const eligibleLine = paiseToRupees(rupeesToPaise(dearest))
  const result = computeDiscount(
    { discountType: 'fixed', percentOff: null, amountOff: FREE_WASH_RULES.maxRupees.toFixed(2), maxDiscountAmount: null },
    subtotal,
    eligibleLine,
    { allowFree: true }
  )
  return { ...result, eligibleLine }
}

/**
 * Whether a checkout is a free wash that covered the whole price: the code
 * is a zone's free wash and nothing is left to charge. The only booking made
 * with no payment at all (booking-intents.service).
 */
export function isFreeWashCheckout(discountSource: string | null | undefined, chargeAmount: string): boolean {
  return discountSource === 'free_wash' && rupeesToPaise(chargeAmount) === 0
}

/** The part of a booking the free wash may come off, for resolveDiscount: the dearest car wash. */
export function freeWashEligibleSubtotal(lines: ReadonlyArray<{ category: string; amount: string }>): string | null {
  const washes = lines.filter((line) => line.category === FREE_WASH_RULES.category)
  if (washes.length === 0) return null
  const dearest = Math.max(...washes.map((line) => rupeesToPaise(line.amount)))
  return paiseToRupees(dearest)
}

/** When a free wash stops working: 30 days from the zone's launch. */
/**
 * A free wash issued to a sign-up that can still be used: switched on, not
 * held by a live booking (`held`: redemptions that count, DISCOUNT_HELD),
 * and before it ends. Home's "Your free wash is ready" and Coverage's
 * "hold an unused free wash" read it.
 */
export function freeWashReady(discount: { isActive: boolean; held: number; endsAt: Date | null }, now: Date): boolean {
  return discount.isActive && discount.held === 0 && discount.endsAt !== null && discount.endsAt > now
}

export function freeWashEndsAt(liveAt: Date): Date {
  return new Date(liveAt.getTime() + FREE_WASH_RULES.validDays * DAY_MS)
}

// ─── Launch day ──────────────────────────────────────────────────────────────

/**
 * Which zones go live now: those with a listed garage in them (lib/zones.ts
 * zonesWithGarages) and no `live_at` yet. Idempotent by construction: a zone
 * with `live_at` is never in the answer, and the write that sets it is
 * conditional on it still being null.
 */
export function zonesToLaunch<Z extends { slug: string; liveAt: Date | null }>(
  zones: readonly Z[],
  withGarage: ReadonlySet<string>
): Z[] {
  return zones.filter((zone) => zone.liveAt === null && withGarage.has(zone.slug))
}

/** Which of a launching zone's sign-ups are issued a free wash: the first 50 not issued yet. */
export function signupsToIssue<S extends { position: number; freeWash: boolean; discountId: string | null }>(
  signups: readonly S[]
): S[] {
  return signups
    .filter((s) => s.freeWash && s.position <= FREE_WASH_RULES.perZone && s.discountId === null)
    .sort((a, b) => a.position - b.position)
}

// ─── Coming back ─────────────────────────────────────────────────────────────

/** Messages about a sign-up go out from 09:00 to 20:59 IST only. */
export function isReachPushHour(now: Date): boolean {
  const hour = istParts(now).hour
  return hour >= 9 && hour < 21
}

export type SignupPush = 'launch' | 'coverage' | 'reminder'

/**
 * The one message a sign-up is due now, if any, in order of news:
 *
 * - `launch`: its zone went live, not told yet;
 * - `coverage`: a doorstep or pickup garage now reaches the zone's centre
 *   (it widened, or a new one came), not told yet and the zone not live;
 * - `reminder`: 14 days with no change (no launch, no coverage, no
 *   reminder yet): one "nearest options" message, then nothing.
 *
 * Every one is claimed (its marker set) before it is sent, so overlapping
 * runs never send twice.
 */
export function signupPushDue(
  signup: {
    createdAt: Date
    launchPushAt: Date | null
    coveragePushAt: Date | null
    reminderPushAt: Date | null
  },
  facts: { zoneLive: boolean; coveredNow: boolean },
  now: Date
): SignupPush | null {
  if (facts.zoneLive) return signup.launchPushAt === null ? 'launch' : null
  if (facts.coveredNow && signup.coveragePushAt === null) return 'coverage'
  const quiet = signup.coveragePushAt === null && signup.reminderPushAt === null
  if (quiet && now.getTime() - signup.createdAt.getTime() >= FREE_WASH_RULES.reminderAfterDays * DAY_MS) {
    return 'reminder'
  }
  return null
}

/** Home's launch banner: the zone is live and the customer has not seen it yet. */
export function showLaunchBanner(signup: { launchBannerSeenAt: Date | null }, zoneLive: boolean): boolean {
  return zoneLive && signup.launchBannerSeenAt === null
}

// ─── The referral credit ─────────────────────────────────────────────────────

export type ReferralRefusal = 'NOT_LINKED' | 'GARAGE_NOT_LIVE' | 'NO_PAID_BOOKING' | 'ALREADY_FOR_GARAGE' | 'CAP_REACHED'

/**
 * Whether a recommendation earns its credit now, and how much: linked to a
 * garage that is live, a completed booking there whose money landed and was
 * kept, not already credited for that garage, and under the ₹500 cap (the
 * last credit is cut to what is left of it).
 */
export function referralCredit(input: {
  vendorId: string | null
  garageLive: boolean
  completedPaidBooking: boolean
  alreadyCreditedForGarage: boolean
  /** Referral credit the customer has had (granted or owed), in rupees. */
  creditedSoFarRupees: number
}): { amountRupees: number } | { refusal: ReferralRefusal } {
  if (!input.vendorId) return { refusal: 'NOT_LINKED' }
  if (!input.garageLive) return { refusal: 'GARAGE_NOT_LIVE' }
  if (!input.completedPaidBooking) return { refusal: 'NO_PAID_BOOKING' }
  if (input.alreadyCreditedForGarage) return { refusal: 'ALREADY_FOR_GARAGE' }
  const left = REFERRAL_CREDIT.maxPerCustomerRupees - input.creditedSoFarRupees
  if (left <= 0) return { refusal: 'CAP_REACHED' }
  return { amountRupees: Math.min(REFERRAL_CREDIT.perGarageRupees, left) }
}

// ─── Words ───────────────────────────────────────────────────────────────────

export function launchPushWords(areaName: string, garages: number): { title: string; body: string } {
  return {
    title: `Detlio is now in ${areaName}`,
    body: `${garages} ${garages === 1 ? 'garage' : 'garages'} near you. Your free wash is ready.`,
  }
}

/** Launch for a sign-up past the first 50: no free wash to promise. */
export function launchPushWordsNoWash(areaName: string, garages: number): { title: string; body: string } {
  return {
    title: `Detlio is now in ${areaName}`,
    body: `${garages} ${garages === 1 ? 'garage' : 'garages'} near you. Book in a few taps.`,
  }
}

export function coveragePushWords(areaName: string, garageName: string, mode: 'doorstep' | 'pickup'): { title: string; body: string } {
  return {
    title: mode === 'doorstep' ? `${garageName} now comes to ${areaName}` : `${garageName} now collects from ${areaName}`,
    body: mode === 'doorstep' ? 'Have your car washed at your door.' : 'They collect your car and bring it back.',
  }
}

export function reminderPushWords(areaName: string): { title: string; body: string } {
  return {
    title: `Still waiting for ${areaName}?`,
    body: 'See the nearest garages, and who can come to you, in the meantime.',
  }
}
