/**
 * Pickup & drop for the apps: the garage collects the customer's car, works
 * on it at the garage and brings it back. The rules are the server's
 * (apps/server/src/lib/pickup.ts); these are the words and numbers the
 * screens show, kept equal to the server's by its pickup.parity.test.ts.
 */

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
