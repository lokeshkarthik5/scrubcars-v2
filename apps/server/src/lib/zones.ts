import { straightLineKm } from './service-city.js'

/**
 * Chennai's zones: the areas a customer picks as "Where's your car?" on the
 * landing page, and the unit the team will plan coverage by (0062).
 *
 * A zone is a centre and a name, nothing drawn: a point belongs to the
 * nearest zone centre within ZONE_RADIUS_KM, and to no zone otherwise. One
 * rule (`zoneFor`) for a garage's pin, a customer's area and anything later
 * (free washes, requests, leads), so they can never disagree about which
 * area something is in.
 *
 * Pure, so the rule is unit-tested without a database (zones.test.ts). The
 * seed list below is what migration 0062 inserts (the test holds the SQL to
 * it) and what the customer app ships as its fallback
 * (packages/core/src/zones.ts, zones.parity.test.ts).
 */

/** How far from a zone's centre a point still belongs to it, in km. */
export const ZONE_RADIUS_KM = 6

/** A new zone's goal for listed garages, until the team sets its own (PR 5). */
export const DEFAULT_ZONE_TARGET = 5

export interface ZoneSeed {
  /** Lower-case words joined by hyphens, as analytics' `area` prop takes. */
  slug: string
  name: string
  lat: number
  lng: number
  /** One of the owner's priority areas: a chip on the landing page. */
  priority: boolean
}

/**
 * The owner's 25 areas (28 Oct 2026). The first seven are the priority ones,
 * in the owner's order, which is also the order of the landing page's chips.
 */
export const CHENNAI_ZONES: readonly ZoneSeed[] = [
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

/** A zone's slug from its name: "T Nagar" → "t-nagar". */
export function zoneSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

type Point = { lat: number; lng: number }

function isPoint(point: { lat: number | null; lng: number | null } | null | undefined): point is Point {
  return (
    point != null &&
    point.lat !== null &&
    point.lng !== null &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng)
  )
}

/**
 * The zone a point belongs to: the nearest centre within ZONE_RADIUS_KM
 * (exactly 6 km is still in), or null for no zone. A tie goes to the zone
 * listed first, so the answer never depends on the order rows came back in
 * beyond the caller's own list. No point (an unpinned garage) is no zone.
 */
export function zoneFor<Z extends Point>(
  point: { lat: number | null; lng: number | null } | null | undefined,
  zones: readonly Z[]
): Z | null {
  if (!isPoint(point)) return null
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

/**
 * How close a listed garage must be to a zone's centre for the zone to count
 * as served, in straight-line km: 10 km is the cards' "~30 min" drive
 * (packages/core drive-time.ts, round(4 + 10 × 2.6) = 30), the same reach as
 * the garage list's "5 garages within ~30 min" (owner, 20 Nov 2026).
 *
 * Before, a zone needed a garage whose pin belonged to it (zoneFor: nearest
 * centre within 6 km). Chennai's zone centres are 2-4 km apart, so a garage
 * 2.9 km from Adyar's centre counted for a neighbour, and nine central areas
 * (Adyar, T Nagar, Nungambakkam…) read "No garage in your area yet" with
 * garages 8-14 minutes away.
 */
export const SERVED_WITHIN_KM = 10

/**
 * The slugs of the zones with at least one live listed garage within
 * SERVED_WITHIN_KM of their centre: what `GET /zones` says per zone
 * (`hasGarage`), what refuses a free-wash sign-up (AREA_LIVE) and what
 * launches a zone. Unpinned garages count nowhere.
 */
export function zonesWithGarages<Z extends Point & { slug: string }>(
  zones: readonly Z[],
  garagePins: ReadonlyArray<{ lat: number | null; lng: number | null }>
): Set<string> {
  const pins = garagePins.filter(isPoint)
  const live = new Set<string>()
  for (const zone of zones) {
    if (pins.some((pin) => straightLineKm(zone, pin) <= SERVED_WITHIN_KM)) live.add(zone.slug)
  }
  return live
}
