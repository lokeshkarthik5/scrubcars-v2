/**
 * Pickup & drop (0037): the garage collects the customer's car from their
 * address, does the work at the garage and brings it back. Owner decisions,
 * 17 Oct 2026:
 *
 *   - Only garages that turn it on, within their own pickup radius, measured
 *     from the garage's pin (an empty radius is the 10 km default, as for
 *     doorstep). 3 hours' notice, as doorstep (lib/slots.ts).
 *   - The garage is responsible for the car from pickup until it is
 *     returned (until Detlio has insurance), and accepts that when it turns
 *     pickup on: the garage's own tick in its portal, or admin recording the
 *     signed agreement. Turning it off is always allowed.
 *   - No pickup fee for now (pickupFeeFor below is where one goes).
 *
 * The job, once accepted: Picked up (the garage types the customer's pickup
 * code) → At garage → the normal work (in progress) → Out for delivery →
 * Delivered (the garage types the delivery code), which completes it.
 *
 * Pure, so every rule is pinned by pickup.test.ts; the clock and the random
 * source are passed in where they matter.
 */

import { randomInt, timingSafeEqual } from 'node:crypto'
import type { BookingType } from './booking-types.js'

// ─── Settings ───────────────────────────────────────────────────────────────

/** How far a garage with no pickup radius collects from. As doorstep's default. */
export const DEFAULT_PICKUP_RADIUS_KM = 10
/** The radius a garage or admin may set, as for doorstep's travel radius. */
export const MIN_PICKUP_RADIUS_KM = 1
export const MAX_PICKUP_RADIUS_KM = 30

/** The garage's own tick in its portal settings. */
export const PICKUP_TERMS_GARAGE =
  "We are responsible for the customer's car from pickup until it is returned"
/** The admin's tick, for a garage onboarded or edited from admin. */
export const PICKUP_TERMS_ADMIN = 'The garage has agreed to this (signed agreement)'

export type VendorPickupAnswer = 'yes' | 'nearby' | 'no'

/** The garage facts pickup reads. */
export interface PickupSettings {
  pickup: VendorPickupAnswer | null
  pickupRadiusKm: number | null
  pickupTermsAcceptedAt: Date | string | null
}

/**
 * Whether a garage offers pickup & drop: it said yes ('nearby', an older
 * onboarding answer, counts as yes) AND the responsibility terms are on file.
 * A 'yes' from onboarding before 0037 has no terms, so it is not on until the
 * garage (or admin, for it) accepts them. The SQL twin is PICKUP_OFFERED in
 * modules/vendors/vendors.predicates.ts; pinned together by its test.
 */
export function isPickupOffered(row: PickupSettings): boolean {
  return (row.pickup === 'yes' || row.pickup === 'nearby') && row.pickupTermsAcceptedAt != null
}

/** The radius that applies: the garage's own, or the default when empty. */
export function effectivePickupRadiusKm(radiusKm: number | null | undefined): number {
  return radiusKm ?? DEFAULT_PICKUP_RADIUS_KM
}

export interface PickupChangeRequest {
  /** On (true) or off (false); undefined leaves it as it is. */
  enabled?: boolean
  /** A new radius in km; null clears it to the default; undefined leaves it. */
  radiusKm?: number | null
  /** The responsibility tick, which turning it on needs. */
  termsAccepted?: boolean
  /** Who ticked, as recorded with the terms. */
  actor: string
  now: Date
}

export interface PickupPatch {
  pickup?: VendorPickupAnswer
  pickupRadiusKm?: number | null
  pickupTermsAcceptedAt?: Date
  pickupTermsAcceptedBy?: string
}

export type PickupChange =
  | { ok: true; patch: PickupPatch }
  | { ok: false; code: 'PICKUP_TERMS_REQUIRED'; message: string }

/**
 * What to write for a change to a garage's pickup settings. Turning it on
 * needs the tick, every time it is turned on (the terms are recorded afresh
 * with who and when); a garage already on can change its radius without it.
 * Turning it off is always allowed and leaves the last acceptance on the row
 * as history (it is no longer "on" with pickup 'no').
 */
export function planPickupChange(current: PickupSettings, request: PickupChangeRequest): PickupChange {
  const patch: PickupPatch = {}
  if (request.radiusKm !== undefined) patch.pickupRadiusKm = request.radiusKm

  if (request.enabled === true && !isPickupOffered(current)) {
    if (request.termsAccepted !== true) {
      return {
        ok: false,
        code: 'PICKUP_TERMS_REQUIRED',
        message:
          "To turn on pickup & drop, tick that the garage is responsible for the customer's car from pickup until it is returned.",
      }
    }
    patch.pickup = 'yes'
    patch.pickupTermsAcceptedAt = request.now
    patch.pickupTermsAcceptedBy = request.actor.slice(0, 120)
  }

  if (request.enabled === false && current.pickup !== 'no') patch.pickup = 'no'

  return { ok: true, patch }
}

/**
 * What an older admin panel means by sending the legacy `pickup` answer
 * ('yes' / 'nearby' / 'no' / null): on or off, or nothing when it only sent
 * back what was stored (it round-trips the field on every save).
 */
export function legacyPickupIntent(
  stored: VendorPickupAnswer | null,
  sent: VendorPickupAnswer | null | undefined
): boolean | undefined {
  if (sent === undefined || sent === stored) return undefined
  return sent === 'yes' || sent === 'nearby'
}

// ─── Price ──────────────────────────────────────────────────────────────────

/**
 * What a booking's type adds to its price. Owner decision (17 Oct 2026): no
 * pickup fee for now; it will be decided later. This is the one place it
 * goes: resolveBookingDraft adds it to the services' total before any promo
 * code, so the checkout, the booking and its payment all carry it. When it
 * stops being zero it also needs a line of its own on the receipt
 * (lib/receipts.ts) and in the checkout summary.
 */
export function bookingTypeFee(_type: BookingType): string {
  return '0.00'
}

// ─── Handover codes ─────────────────────────────────────────────────────────

/** The customer's codes are 4 digits. */
export const HANDOVER_CODE_DIGITS = 4
/** Wrong tries a code takes before the step needs Detlio (admin). */
export const MAX_CODE_ATTEMPTS = 5

const CODE_SPACE = 10 ** HANDOVER_CODE_DIGITS

export type RandomInt = (min: number, max: number) => number

/** A fresh 4-digit code, "0042" included. Crypto-random by default. */
export function newHandoverCode(random: RandomInt = randomInt): string {
  return String(random(0, CODE_SPACE)).padStart(HANDOVER_CODE_DIGITS, '0')
}

/**
 * A booking's two codes. Never the same, so the pickup code can never also
 * hand the car back.
 */
export function newHandoverCodes(random: RandomInt = randomInt): {
  pickupCode: string
  deliveryCode: string
} {
  const pickupCode = newHandoverCode(random)
  let deliveryCode = newHandoverCode(random)
  while (deliveryCode === pickupCode) deliveryCode = newHandoverCode(random)
  return { pickupCode, deliveryCode }
}

export type CodeCheck = 'ok' | 'wrong' | 'locked' | 'missing'

/**
 * Checks what the garage typed against the customer's code. Locked once the
 * wrong tries reach MAX_CODE_ATTEMPTS, whatever is typed — the right code
 * included, or the cap would only slow a guesser down. Compared in constant
 * time.
 */
export function checkHandoverCode(input: {
  expected: string | null
  given: string
  attempts: number
}): CodeCheck {
  if (input.attempts >= MAX_CODE_ATTEMPTS) return 'locked'
  if (!input.expected) return 'missing'
  const a = Buffer.from(input.expected)
  const b = Buffer.from(input.given)
  return a.length === b.length && timingSafeEqual(a, b) ? 'ok' : 'wrong'
}

/** Tries left on a code. */
export function codeTriesLeft(attempts: number): number {
  return Math.max(0, MAX_CODE_ATTEMPTS - attempts)
}

// ─── The job's steps ────────────────────────────────────────────────────────

/** The steps only pickup & drop has, as the garage presses them. */
export type PickupStep = 'picked_up' | 'at_garage' | 'out_for_delivery' | 'delivered'

/** What a pickup job needs done next. `start_work` is the normal Mark in progress. */
export type PickupNext = PickupStep | 'start_work'

const ORDER: readonly PickupNext[] = [
  'picked_up',
  'at_garage',
  'start_work',
  'out_for_delivery',
  'delivered',
]

const STEP_LABELS: Record<PickupNext, string> = {
  picked_up: 'Picked up',
  at_garage: 'At garage',
  start_work: 'In progress',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
}

export interface PickupJob {
  bookingType: string
  status: string
  pickedUpAt: Date | string | null
  atGarageAt: Date | string | null
  outForDeliveryAt: Date | string | null
  deliveredAt: Date | string | null
}

/**
 * The step a pickup job is waiting for, or null when none is (not accepted
 * yet, finished, cancelled, or not a pickup job). The garage portal shows
 * one button from this, so it never restates the order.
 */
export function nextPickupStep(job: PickupJob): PickupNext | null {
  if (job.bookingType !== 'pickup') return null
  if (job.status === 'confirmed') {
    if (!job.pickedUpAt) return 'picked_up'
    if (!job.atGarageAt) return 'at_garage'
    return 'start_work'
  }
  if (job.status === 'in_progress') {
    if (!job.outForDeliveryAt) return 'out_for_delivery'
    if (!job.deliveredAt) return 'delivered'
  }
  return null
}

export interface StepRefusal {
  status: 400 | 409
  code: 'NOT_PICKUP_BOOKING' | 'PICKUP_STEP_OUT_OF_ORDER' | 'PICKUP_STEP_DONE' | 'INVALID_BOOKING_STATUS'
  message: string
}

/**
 * Why a step can't be taken now, or null when it can: the job must be a
 * pickup job and the step must be the one it is waiting for. A step already
 * done says so (a double tap, or a second phone), one too early names what
 * comes first.
 */
export function pickupStepRefusal(job: PickupJob, step: PickupNext): StepRefusal | null {
  if (job.bookingType !== 'pickup') {
    return {
      status: 400,
      code: 'NOT_PICKUP_BOOKING',
      message: "This isn't a pickup & drop booking.",
    }
  }
  const next = nextPickupStep(job)
  if (next === step) return null

  if (next === null) {
    return {
      status: 400,
      code: 'INVALID_BOOKING_STATUS',
      message:
        job.status === 'pending'
          ? 'Accept the booking first.'
          : 'This booking is no longer open, so its steps cannot change.',
    }
  }
  if (ORDER.indexOf(step) < ORDER.indexOf(next)) {
    return {
      status: 409,
      code: 'PICKUP_STEP_DONE',
      message: `${STEP_LABELS[step]} is already marked. Next: ${STEP_LABELS[next]}.`,
    }
  }
  return {
    status: 409,
    code: 'PICKUP_STEP_OUT_OF_ORDER',
    message: `Not yet: mark ${STEP_LABELS[next]} first.`,
  }
}

/**
 * Pickup & drop finishes on Delivered, with the customer's code, so the
 * plain Mark completed is refused for it. Null for every other type.
 */
export function completeRefusal(job: Pick<PickupJob, 'bookingType'>): StepRefusal | null {
  if (job.bookingType !== 'pickup') return null
  return {
    status: 409,
    code: 'PICKUP_STEP_OUT_OF_ORDER',
    message: "A pickup & drop job is finished when the car is delivered: mark it Out for delivery, then Delivered with the customer's code.",
  }
}

/**
 * Once the garage has the car, the customer can no longer cancel or move the
 * booking themselves: the car has to come back first. Detlio can still act
 * from admin. Null when they can.
 */
export function customerChangeRefusal(job: Pick<PickupJob, 'bookingType' | 'pickedUpAt'>): string | null {
  if (job.bookingType !== 'pickup' || !job.pickedUpAt) return null
  return 'The garage has already collected your car, so this booking can no longer be changed in the app. Please call the garage or Detlio support.'
}

// ─── The customer's side ────────────────────────────────────────────────────

/**
 * Where a pickup & drop job has got, as the customer's timeline names it
 * (Booked → Picked up → At garage → Being worked on → Out for delivery →
 * Delivered). Home's Next booking tile carries it; the words live in the
 * apps (packages/core/src/pickup.ts PICKUP_STAGE_NOW).
 */
export type CustomerPickupStage =
  | 'booked'
  | 'picked_up'
  | 'at_garage'
  | 'in_progress'
  | 'out_for_delivery'
  | 'delivered'

/**
 * The latest step a pickup job has reached. The apps' twin is pickupStageOf
 * in packages/core/src/pickup.ts, pinned by pickup.parity.test.ts. A
 * completed job is delivered whatever was recorded; a step with no time is
 * not reached.
 */
export function customerPickupStage(facts: {
  status: string
  pickedUpAt?: Date | string | null
  atGarageAt?: Date | string | null
  startedAt?: Date | string | null
  outForDeliveryAt?: Date | string | null
  deliveredAt?: Date | string | null
}): CustomerPickupStage {
  if (facts.status === 'completed' || facts.deliveredAt) return 'delivered'
  if (facts.outForDeliveryAt) return 'out_for_delivery'
  if (facts.status === 'in_progress' || facts.startedAt) return 'in_progress'
  if (facts.atGarageAt) return 'at_garage'
  if (facts.pickedUpAt) return 'picked_up'
  return 'booked'
}

// ─── Ops ────────────────────────────────────────────────────────────────────

/**
 * How long after the slot a confirmed pickup job with no Picked up is called
 * late in the team's digest. Not at the slot itself: a driver five minutes
 * behind is not news.
 */
export const PICKUP_LATE_AFTER_MINS = 30
