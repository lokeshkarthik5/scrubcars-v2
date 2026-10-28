/**
 * Chennai's zones, for the customer app's "Where's your car?" chips and the
 * area sheet (customer reach, 0062).
 *
 * The API's `GET /zones` is the list that counts (admin will edit zones,
 * PR 5); this is its seeded copy, so the landing page can render its chips
 * on the server without a request and still has them before that API is
 * live. Kept equal to the server's seed (apps/server/src/lib/zones.ts
 * CHENNAI_ZONES, and migration 0062) by zones.parity.test.ts.
 */

import { straightLineKm } from './map'

/** How far from a zone's centre a point still belongs to it, in km. */
export const ZONE_RADIUS_KM = 6

export interface Zone {
  slug: string
  name: string
  lat: number
  lng: number
  /** The owner's priority areas: the landing page's chips. */
  priority: boolean
  /**
   * A live listed garage is in the zone. Only the API knows; the seeded copy
   * says null (unknown).
   */
  hasGarage?: boolean | null
  /**
   * The free-wash list (part 2): "N waiting here" from 10 sign-ups, null
   * below ("Be the first"). Only the API knows.
   */
  waiting?: number | null
  /** Free washes still to give to this area's list (of the first 50). Only the API knows. */
  freeWashesLeft?: number
}

export const CHENNAI_ZONES: readonly Zone[] = [
  { slug: 'adyar', name: 'Adyar', lat: 13.0012, lng: 80.2565, priority: true },
  { slug: 'nungambakkam', name: 'Nungambakkam', lat: 13.0569, lng: 80.2425, priority: true },
  { slug: 'anna-nagar', name: 'Anna Nagar', lat: 13.085, lng: 80.2101, priority: true },
  { slug: 'sholinganallur', name: 'Sholinganallur', lat: 12.901, lng: 80.2279, priority: true },
  { slug: 'navalur', name: 'Navalur', lat: 12.8459, lng: 80.2265, priority: true },
  { slug: 'guindy', name: 'Guindy', lat: 13.0067, lng: 80.2206, priority: true },
  { slug: 't-nagar', name: 'T Nagar', lat: 13.0418, lng: 80.2341, priority: true },
  { slug: 'velachery', name: 'Velachery', lat: 12.9815, lng: 80.218, priority: false },
  { slug: 'mylapore', name: 'Mylapore', lat: 13.0368, lng: 80.2676, priority: false },
  { slug: 'kilpauk', name: 'Kilpauk', lat: 13.085, lng: 80.242, priority: false },
  { slug: 'egmore', name: 'Egmore', lat: 13.0732, lng: 80.2609, priority: false },
  { slug: 'porur', name: 'Porur', lat: 13.0382, lng: 80.1565, priority: false },
  { slug: 'vadapalani', name: 'Vadapalani', lat: 13.05, lng: 80.2121, priority: false },
  { slug: 'kodambakkam', name: 'Kodambakkam', lat: 13.0524, lng: 80.2255, priority: false },
  { slug: 'chromepet', name: 'Chromepet', lat: 12.9516, lng: 80.1462, priority: false },
  { slug: 'tambaram', name: 'Tambaram', lat: 12.9249, lng: 80.1, priority: false },
  { slug: 'pallikaranai', name: 'Pallikaranai', lat: 12.9349, lng: 80.2137, priority: false },
  { slug: 'medavakkam', name: 'Medavakkam', lat: 12.9171, lng: 80.1923, priority: false },
  { slug: 'perungudi', name: 'Perungudi', lat: 12.9654, lng: 80.2461, priority: false },
  { slug: 'thiruvanmiyur', name: 'Thiruvanmiyur', lat: 12.983, lng: 80.2594, priority: false },
  { slug: 'ambattur', name: 'Ambattur', lat: 13.1143, lng: 80.1548, priority: false },
  { slug: 'perambur', name: 'Perambur', lat: 13.121, lng: 80.2329, priority: false },
  { slug: 'royapettah', name: 'Royapettah', lat: 13.054, lng: 80.264, priority: false },
  { slug: 'kotturpuram', name: 'Kotturpuram', lat: 13.02, lng: 80.2415, priority: false },
  { slug: 'ashok-nagar', name: 'Ashok Nagar', lat: 13.0359, lng: 80.2121, priority: false },
]

/**
 * The order the chips and the sheet show zones in: the priority ones first,
 * each group A–Z (the API's own order, `GET /zones`).
 */
export function orderZones<Z extends Pick<Zone, 'name' | 'priority'>>(zones: readonly Z[]): Z[] {
  return [...zones].sort((a, b) =>
    a.priority === b.priority ? a.name.localeCompare(b.name, 'en') : a.priority ? -1 : 1
  )
}

/**
 * The sheet's search: zones whose name has every typed word at the start of
 * one of its words ("nag" finds Anna Nagar, T Nagar and Ashok Nagar; "t n"
 * finds T Nagar). Empty finds every zone. Order is kept.
 */
export function searchZones<Z extends Pick<Zone, 'name'>>(zones: readonly Z[], query: string): Z[] {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  if (terms.length === 0) return [...zones]
  return zones.filter((zone) => {
    const words = zone.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    return terms.every((term) => words.some((word) => word.startsWith(term)))
  })
}

/**
 * The zone a point is in (customer reach, part 2): the nearest centre within
 * ZONE_RADIUS_KM, else none; a tie goes to the zone listed first. The
 * server's rule (apps/server/src/lib/zones.ts zoneFor), twinned so the app
 * knows the customer's area from a phone fix as well as from a chip
 * (zones.parity.test.ts).
 */
export function zoneFor<Z extends Pick<Zone, 'lat' | 'lng'>>(
  point: { lat: number; lng: number } | null | undefined,
  zones: readonly Z[]
): Z | null {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null
  let best: Z | null = null
  let bestKm = Infinity
  for (const zone of zones) {
    const km = straightLineKm(point, zone)
    if (km <= ZONE_RADIUS_KM && km < bestKm) {
      best = zone
      bestKm = km
    }
  }
  return best
}
