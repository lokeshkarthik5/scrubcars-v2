/**
 * Which garages a customer's list reaches: any radius asked for and the
 * unpinned tail.
 *
 * Pure, so the rules are unit-tested without a database. The SQL that applies
 * them is vendorsRepository.listPublicVendorPage.
 */

/**
 * The city's reach from its centre and Home's "Nearby" count, in km: 50
 * (owner decision, 2026-10-16). The service city's sign (lib/service-city.ts)
 * calls a garage further than this from the centre "Outside Chennai", Home's
 * Nearby card counts the at-garage garages within this distance of the
 * customer (home.service.ts), and "Book another garage" (0042) looks this far
 * for drop-in.
 *
 * The garage list itself no longer stops here (customer reach, 0062: "the
 * list is never empty"): with a location it is every listed garage, nearest
 * first, paginated, unless the caller asks for a radius (the map's Nearby
 * mode does, with this one).
 */
export const CITY_REACH_KM = 50

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
   * How far from the customer to look, in km, or null for no bound: only
   * when the caller asked for one. The same on every page of one list, so
   * the offset in its cursor always counts into the same set of garages.
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
    // No default bound (0062): a located customer sees every garage, nearest
    // first. An explicit radius is taken as a real constraint.
    radiusKm: usesRadius ? (query.radiusKm ?? null) : null,
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
