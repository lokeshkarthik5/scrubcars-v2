/**
 * Pickup & drop for the apps: the garage collects the customer's car, works
 * on it at the garage and brings it back. The rules are the server's
 * (apps/server/src/lib/pickup.ts); these are the words and numbers the
 * screens show, kept equal to the server's by its pickup.parity.test.ts.
 */

// Relative, not @repo/core/map: the server's parity test loads this file by
// path, outside the workspace's aliases.
import { straightLineKm } from './map'

/** How far a garage with no pickup radius collects from. */
export const DEFAULT_PICKUP_RADIUS_KM = 10
/** The radius a garage or admin may set. */
export const MIN_PICKUP_RADIUS_KM = 1
export const MAX_PICKUP_RADIUS_KM = 30

/** The garage's own tick, in its portal settings. */
export const PICKUP_TERMS_GARAGE =
  "We are responsible for the customer's car from pickup until it is returned"
/** The admin's tick, for a garage onboarded or edited from admin. */
export const PICKUP_TERMS_ADMIN = 'The garage has agreed to this (signed agreement)'

/** Wrong tries a handover code takes before Detlio has to confirm the step. */
export const MAX_CODE_ATTEMPTS = 5

/** The steps only pickup & drop has, plus the normal work between them. */
export type PickupNext = 'picked_up' | 'at_garage' | 'start_work' | 'out_for_delivery' | 'delivered'

/**
 * Whether the garage's step shows "Too many wrong codes" instead of the code
 * box. `lockedStep` is the step a HANDOVER_CODE_LOCKED answer came back on:
 * the lock belongs to that step only, so once Detlio confirms the handover
 * from admin and the job moves on, the next step shows again without a
 * reload. Otherwise the server's tries left decide.
 */
export function handoverLocked(
  step: PickupNext,
  lockedStep: PickupNext | null,
  triesLeft: number | undefined
): boolean {
  if (lockedStep === step) return true
  return (step === 'picked_up' || step === 'delivered') && triesLeft === 0
}

/** What each step is called on the garage's button and in step times. */
export const PICKUP_STEP_LABELS: Record<PickupNext, string> = {
  picked_up: 'Picked up',
  at_garage: 'At garage',
  start_work: 'In progress',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
}

/**
 * "Pickup within 8 km", "Pickup within 10 km (default)". The admin card's and
 * the portal's status line.
 */
export function pickupReachLine(radiusKm: number | null): string {
  return radiusKm == null
    ? `Pickup within ${DEFAULT_PICKUP_RADIUS_KM} km (default)`
    : `Pickup within ${radiusKm} km`
}

export type PickupRadiusInput = { ok: true; km: number | null } | { ok: false; message: string }

/** The radius box: empty is the default, otherwise 1 to 30 km, decimals allowed. */
export function parsePickupRadius(value: string): PickupRadiusInput {
  const trimmed = value.trim()
  if (trimmed === '') return { ok: true, km: null }
  const km = Number(trimmed)
  if (!Number.isFinite(km) || km < MIN_PICKUP_RADIUS_KM || km > MAX_PICKUP_RADIUS_KM) {
    return {
      ok: false,
      message: `Enter a distance from ${MIN_PICKUP_RADIUS_KM} to ${MAX_PICKUP_RADIUS_KM} km, or leave it empty for ${DEFAULT_PICKUP_RADIUS_KM} km.`,
    }
  }
  return { ok: true, km }
}

// ─── The customer's side ────────────────────────────────────────────────────

/**
 * What the customer reads before paying for pickup & drop (owner decision,
 * 17 Oct 2026): the garage, not Detlio, has the car from pickup until it is
 * back.
 */
export const PICKUP_RESPONSIBILITY_LINE =
  "The garage is responsible for your car from pickup until it's returned."

/**
 * Where a pickup & drop job has got, as the customer's timeline names it:
 * Booked → Picked up → At garage → Being worked on → Out for delivery →
 * Delivered. `in_progress` is the normal Mark in progress.
 */
export type PickupStage =
  | 'booked'
  | 'picked_up'
  | 'at_garage'
  | 'in_progress'
  | 'out_for_delivery'
  | 'delivered'

export const PICKUP_STAGES: readonly PickupStage[] = [
  'booked',
  'picked_up',
  'at_garage',
  'in_progress',
  'out_for_delivery',
  'delivered',
]

/** The timeline's step names. */
export const PICKUP_STAGE_LABELS: Record<PickupStage, string> = {
  booked: 'Booked',
  picked_up: 'Picked up',
  at_garage: 'At garage',
  in_progress: 'Being worked on',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
}

/**
 * What Home's Next booking tile and the bookings list say once the car has
 * left the customer: short, and true at a glance. Booked has none — the
 * booking's own status says it ("Requested", "Next booking").
 */
export const PICKUP_STAGE_NOW: Record<Exclude<PickupStage, 'booked'>, string> = {
  picked_up: 'Car collected',
  at_garage: 'At the garage',
  in_progress: 'Being worked on',
  out_for_delivery: 'On its way back',
  delivered: 'Car returned',
}

/** The facts the stage is read from, as either side names them. */
export interface PickupStageFacts {
  status: string
  pickedUpAt?: string | Date | null
  atGarageAt?: string | Date | null
  startedAt?: string | Date | null
  outForDeliveryAt?: string | Date | null
  deliveredAt?: string | Date | null
}

/**
 * The latest step the job has reached. Twinned by `customerPickupStage` in
 * apps/server/src/lib/pickup.ts (Home's tile), pinned by its parity test.
 * A completed job is delivered whatever was recorded (Detlio can confirm the
 * step from admin); a step with no time is not reached.
 */
export function pickupStageOf(facts: PickupStageFacts): PickupStage {
  if (facts.status === 'completed' || facts.deliveredAt) return 'delivered'
  if (facts.outForDeliveryAt) return 'out_for_delivery'
  if (facts.status === 'in_progress' || facts.startedAt) return 'in_progress'
  if (facts.atGarageAt) return 'at_garage'
  if (facts.pickedUpAt) return 'picked_up'
  return 'booked'
}

export interface PickupTimelineStep {
  key: PickupStage
  label: string
  caption: string
  state: 'done' | 'current' | 'upcoming'
  /** When it happened, ISO; only on a step reached with a recorded time. */
  at?: string
}

/** The booking fields the timeline reads (packages/core Booking). */
export interface PickupTimelineBooking {
  status: string
  vendorName: string
  requestedAtIso: string
  acceptedAtIso?: string
  startedAtIso?: string
  completedAtIso?: string
  pickup?: {
    pickedUpAtIso?: string
    atGarageAtIso?: string
    outForDeliveryAtIso?: string
    deliveredAtIso?: string
  }
}

const LIVE = new Set(['pending', 'confirmed', 'in_progress'])

/**
 * The booking page's step timeline for a pickup & drop job. Every step up to
 * the latest reached is done; while the job is on, the one after it is
 * current (what the next change will be), except before the garage accepts,
 * when Booked itself is still waiting. Null for a cancelled or moved booking,
 * which has no progress to show.
 */
export function pickupTimeline(booking: PickupTimelineBooking): PickupTimelineStep[] | null {
  if (booking.status === 'cancelled' || booking.status === 'rescheduled') return null
  const pickup = booking.pickup ?? {}
  const reached = pickupStageOf({
    status: booking.status,
    pickedUpAt: pickup.pickedUpAtIso,
    atGarageAt: pickup.atGarageAtIso,
    startedAt: booking.startedAtIso,
    outForDeliveryAt: pickup.outForDeliveryAtIso,
    deliveredAt: pickup.deliveredAtIso,
  })
  const reachedIndex = PICKUP_STAGES.indexOf(reached)
  const pending = booking.status === 'pending'
  const live = LIVE.has(booking.status)
  const garage = booking.vendorName

  const times: Record<PickupStage, string | undefined> = {
    booked: booking.acceptedAtIso ?? booking.requestedAtIso,
    picked_up: pickup.pickedUpAtIso,
    at_garage: pickup.atGarageAtIso,
    in_progress: booking.startedAtIso,
    out_for_delivery: pickup.outForDeliveryAtIso,
    delivered: pickup.deliveredAtIso ?? booking.completedAtIso,
  }

  const captions: Record<PickupStage, Record<PickupTimelineStep['state'], string>> = {
    booked: {
      done: `${garage} accepted your booking`,
      current: `Waiting for ${garage} to accept`,
      upcoming: `Waiting for ${garage} to accept`,
    },
    picked_up: {
      done: 'The garage has your car',
      current: 'The garage comes to your address at your booked time',
      upcoming: 'The garage collects your car from your address',
    },
    at_garage: {
      done: 'Your car reached the garage',
      current: 'On the way to the garage',
      upcoming: 'Your car is taken to the garage',
    },
    in_progress: {
      done: 'The work on your car is done',
      current: 'Work starts once your car is at the garage',
      upcoming: 'The garage works on your car',
    },
    out_for_delivery: {
      done: 'Your car is on its way back',
      current: 'Shows here when your car leaves the garage',
      upcoming: 'The garage brings your car back',
    },
    delivered: {
      done: 'Your car is back with you',
      current: 'On its way back to you',
      upcoming: 'Your car is back with you',
    },
  }

  // Under way: the step the next change lands on. Before the garage accepts
  // that is Booked itself; while the work runs it is Being worked on, which
  // is reached and not over until the car leaves; otherwise the one after
  // the latest reached. A finished job has none.
  const working = reached === 'in_progress'
  const currentIndex = pending
    ? 0
    : !live
      ? -1
      : working
        ? reachedIndex
        : reachedIndex + 1
  const doneThrough = pending ? -1 : working ? reachedIndex - 1 : reachedIndex

  return PICKUP_STAGES.map((key, index) => {
    const state: PickupTimelineStep['state'] =
      index <= doneThrough ? 'done' : index === currentIndex ? 'current' : 'upcoming'
    const caption =
      key === 'in_progress' && working ? 'Work has started on your car' : captions[key][state]
    return {
      key,
      label: PICKUP_STAGE_LABELS[key],
      caption,
      state,
      at: state === 'upcoming' ? undefined : times[key],
    }
  })
}

/** The code card on a pickup & drop booking. */
export type PickupCodeCard =
  | { kind: 'pickup'; code: string; title: string; line: string }
  | { kind: 'delivery'; code: string; title: string; line: string }

/**
 * Which handover code the customer needs now, if any: the pickup code until
 * the garage has the car, then the delivery code until it is back. Only the
 * customer's own booking carries codes (the server's customerPickupView,
 * which also drops them once the booking is no longer on); this decides
 * which one to show, and shows none for a booking that is over.
 */
export function pickupCodeCard(
  booking: { status: string; pickup?: { pickedUpAtIso?: string; deliveredAtIso?: string; pickupCode?: string | null; deliveryCode?: string | null } }
): PickupCodeCard | null {
  if (!LIVE.has(booking.status) || !booking.pickup) return null
  const { pickup } = booking
  if (!pickup.pickedUpAtIso) {
    return pickup.pickupCode
      ? {
          kind: 'pickup',
          code: pickup.pickupCode,
          title: 'Pickup code',
          line: 'Give this code to the garage when they collect your car:',
        }
      : null
  }
  if (!pickup.deliveredAtIso && pickup.deliveryCode) {
    return {
      kind: 'delivery',
      code: pickup.deliveryCode,
      title: 'Delivery code',
      line: 'Give this code when your car is returned:',
    }
  }
  return null
}

/**
 * The garage has the car: from Picked up on, the customer can no longer
 * cancel or move the booking in the app (the server answers 409
 * CAR_WITH_GARAGE). Mirrors customerChangeRefusal on the server.
 */
export function carWithGarage(booking: {
  bookingType: string
  pickup?: { pickedUpAtIso?: string }
}): boolean {
  return booking.bookingType === 'pickup' && !!booking.pickup?.pickedUpAtIso
}

/** The fee line checkout shows for pickup & drop: free until the owner sets one. */
export function pickupFeeLabel(fee: number | null | undefined): string {
  return fee && fee > 0 ? `₹${fee.toLocaleString('en-IN')}` : 'Free'
}

/**
 * Whether a pinned point is inside a garage's pickup reach, as far as the
 * app can tell: straight-line km from the garage's pin, against its radius
 * (empty is the 10 km default). The server's check is the one that counts
 * (OUTSIDE_PICKUP_RADIUS); this only lets checkout say so before Pay. A hair
 * of slack keeps a point on the very edge from being refused here and
 * accepted there. Unknown (no pin on either side) is not "outside".
 */
export function insidePickupReach(
  garage: { lat: number | null; lng: number | null; pickupRadiusKm?: number | null },
  point: { lat: number | null; lng: number | null }
): boolean | null {
  if (garage.lat == null || garage.lng == null || point.lat == null || point.lng == null) return null
  const radius = garage.pickupRadiusKm ?? DEFAULT_PICKUP_RADIUS_KM
  return straightLineKm({ lat: garage.lat, lng: garage.lng }, { lat: point.lat, lng: point.lng }) <= radius * 1.01
}
