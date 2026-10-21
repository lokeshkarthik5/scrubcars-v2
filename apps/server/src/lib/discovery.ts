/**
 * Which garages a customer's list reaches: the radius and the unpinned tail.
 *
 * Pure, so the rules are unit-tested without a database. The SQL that applies
 * them is vendorsRepository.listPublicVendorPage.
 */

/**
 * How far the garage list reaches from the customer: every garage within this
 * distance, nearest first (owner decision, 2026-10-16). One bound, the same on
 * every page, rather than the old 10 → 25 → 50 km ladder. The ladder stopped
 * at the first ring with anything in it, so one garage within 10 km hid every
 * garage 11–50 km away; and page 2 restarted it at 10 km, so a widened list
 * skipped from page 1 straight to the unpinned tail.
 *
 * Home's Nearby card counts within the same distance (home.service.ts), so
 * its number matches the pinned part of the list it leads to.
 */
export const LIST_RADIUS_KM = 50

export interface ListScopeQuery {
  /** Whether the customer sent a location. */
  hasOrigin: boolean
  /** The map's viewport, when the map is asking. */
  bbox?: unknown
  bookingType?: 'dropin' | 'doorstep' | 'pickup'
  /** A typed search. */
  q?: string
  /** A radius the caller asked for itself. Validation caps it at 50. */
  radiusKm?: number
  includeUnlocated?: boolean
}

export interface ListScope {
  /**
   * How far from the customer to look, in km, or null for no bound. The same
   * on every page of one list, so the offset in its cursor always counts into
   * the same set of garages.
   */
  radiusKm: number | null
  /** Whether garages with no pin follow the located ones. */
  includeUnlocated: boolean
}

/** Doorstep and pickup: the garage comes to the customer, as far as it says. */
function comesToCustomer(bookingType: ListScopeQuery['bookingType']): boolean {
  return bookingType === 'doorstep' || bookingType === 'pickup'
}

export function listScope(query: ListScopeQuery): ListScope {
  // A radius needs somewhere to measure from. The map is bounded by its
  // viewport instead, and doorstep and pickup by each garage's own travel
  // radius (the question there is "who will come to me"). A typed search has no radius
  // either (owner decision): someone typing a garage's name wants that garage,
  // wherever it is, and still gets it nearest first.
  const usesRadius =
    query.hasOrigin &&
    query.bbox === undefined &&
    !comesToCustomer(query.bookingType) &&
    query.q === undefined

  return {
    // An explicit radius is taken as a real constraint, not a suggestion.
    radiusKm: usesRadius ? (query.radiusKm ?? LIST_RADIUS_KM) : null,
    // On by default, because hiding unpinned garages is the worse failure:
    // many are still unpinned, and a geo filter they cannot satisfy would
    // show "no garages" for a city full of them. Two places cannot use them.
    // The map cannot draw a garage with no pin. And the Doorstep tab cannot
    // book one, nor Pickup & drop: both check the garage travels to the
    // address from its pin (bookingsRepository.isWithinDoorstepRadius, and
    // the pickup radius), so an unpinned garage listed there would refuse
    // every booking.
    includeUnlocated:
      query.bbox !== undefined || comesToCustomer(query.bookingType)
        ? false
        : (query.includeUnlocated ?? true),
  }
}
