/**
 * "Never an empty list" (customer reach, 0062): the rules for the Doorstep
 * and Pickup & drop tabs' second group, "Just outside their area", and for
 * when a list carries the reach figures.
 *
 * Pure, so the rules are unit-tested without a database (reach.test.ts). The
 * SQL that applies them is reachRepository.listJustOutside; the customer
 * app's twin for the words is packages/core/src/reach.ts.
 */

/**
 * How far past its own reach a garage may be and still be offered as "just
 * outside": its doorstep (or pickup) radius plus this many km, measured from
 * its pin; for a garage with a drawn doorstep area, this many km from the
 * area's edge.
 */
export const JUST_OUTSIDE_KM = 15

/** At most this many garages in the "Just outside their area" group. */
export const JUST_OUTSIDE_LIMIT = 10

/**
 * How far outside a garage's reach the customer is, in km to one decimal,
 * from the straight-line distance to its pin and the radius it covers.
 * Never under 0.1: a garage only reaches this group when it does not cover
 * the customer, and "0 km outside" would read as covered.
 */
export function outsideByKm(distanceKm: number, coverKm: number): number {
  return Math.max(0.1, Math.round((distanceKm - coverKm) * 10) / 10)
}

/**
 * Whether a garage that does not cover the customer is close enough to be
 * offered: more than 0 and at most JUST_OUTSIDE_KM past its reach.
 */
export function isJustOutside(outsideKm: number): boolean {
  return Number.isFinite(outsideKm) && outsideKm > 0 && outsideKm <= JUST_OUTSIDE_KM
}

/**
 * Whether a list request carries the reach figures and the "just outside"
 * group: only a list's first page (the figures are the same on every page),
 * and never for a typed search or the map, which answer other questions.
 */
export function listCarriesReach(query: { cursor?: string; q?: string; bbox?: unknown }): boolean {
  return query.cursor === undefined && query.q === undefined && query.bbox === undefined
}

/** Whether the "just outside" group applies: Doorstep or Pickup & drop, with a location. */
export function listCarriesJustOutside(query: {
  cursor?: string
  q?: string
  bbox?: unknown
  bookingType?: 'dropin' | 'doorstep' | 'pickup'
  hasOrigin: boolean
}): boolean {
  return (
    listCarriesReach(query) &&
    query.hasOrigin &&
    (query.bookingType === 'doorstep' || query.bookingType === 'pickup')
  )
}
