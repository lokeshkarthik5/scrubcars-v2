/**
 * A garage as anyone may see it, signed in or not: GET /vendors/:id, the
 * garage page and checkout.
 *
 * An allow-list on purpose (owner decision, 17 Oct 2026): a customer gets a
 * garage's phone, WhatsApp, email and street address only once they have
 * booked it, from their own booking (GET /bookings/:id, toBookingResponse's
 * `vendor`), so nobody can find a garage here and then go round the app. So
 * this carries what the screens show before booking — name, logo, city and
 * pincode, the pin for the map, how it takes bookings and how far it goes
 * (with "All over <city>", 0069, the city's centre and reach, never more),
 * whether it is paused and why — and nothing else. A new column on `vendors`
 * stays private until someone adds it here on purpose.
 *
 * The tiers (0063, lib/tiers.ts) reach customers as one value, `tier`: the
 * medal they may see (the highest held tier admin has switched on, null while
 * hidden). Never the standards' numbers, the documents, the quality checks,
 * who awarded it or whether admin hid it. (`documentsVerified` and
 * `certified`, the two badges tiers replace, are gone.)
 *
 * Never here: phone, whatsapp, email, address, mapsUrl, notes (the admin's
 * ops note), ownerId, the raw pickup answer and who accepted its terms,
 * where the pin came from, bays and jobs per day. Admin and the garage's own
 * portal read the full row through their own endpoints.
 */
import type { CityPlace } from '../../lib/cities.js'
import { isPickupOffered } from '../../lib/pickup.js'
import type { Tier } from '../../lib/tiers.js'
import type { VendorRecord } from './vendors.repository.js'

/** The columns the public shape is built from. */
export type PublicVendorSource = Pick<
  VendorRecord,
  | 'id'
  | 'businessName'
  | 'logoUrl'
  | 'city'
  | 'pincode'
  | 'lat'
  | 'lng'
  | 'yearsInOperation'
  | 'isVerified'
  | 'status'
  | 'dropinEnabled'
  | 'doorstepEnabled'
  | 'doorstepRadiusKm'
  | 'doorstepWholeCity'
  | 'pickup'
  | 'pickupRadiusKm'
  | 'pickupTermsAcceptedAt'
  | 'pickupWholeCity'
  | 'slotIntervalMins'
  | 'bookingsPausedAt'
  | 'bookingsPausedReason'
  | 'createdAt'
>

export type PublicVendorFields = {
  id: string
  businessName: string
  logoUrl: string | null
  city: string
  pincode: string
  /** The pin, for the map and the distance line. Not a street address. */
  lat: number | null
  lng: number | null
  yearsInOperation: string | null
  isVerified: boolean
  status: string
  dropinEnabled: boolean
  doorstepEnabled: boolean
  doorstepRadiusKm: number | null
  /** Offers pickup & drop now (isPickupOffered). */
  pickupEnabled: boolean
  /** How far it collects cars from; null is the 10 km default. */
  pickupRadiusKm: number | null
  /**
   * Comes anywhere in its city for doorstep (0069): said so, and its pin is
   * in a city. The radius is then not what decides; `reachCity` is.
   */
  doorstepWholeCity: boolean
  /** Collects anywhere in its city (0069), as doorstepWholeCity; only while pickup is on. */
  pickupWholeCity: boolean
  /**
   * The city a whole-city garage covers, for "Comes anywhere in Chennai" and
   * checkout's early "outside the area" check: its name, centre and reach.
   * A city's centre, never the garage's address. Null when neither whole-city
   * option applies.
   */
  reachCity: { name: string; lat: number; lng: number; reachKm: number } | null
  slotIntervalMins: number
  /**
   * Public on purpose: the garage page says "Not taking bookings right now",
   * with the reason when the owner gave one.
   */
  bookingsPausedAt: string | null
  bookingsPausedReason: string | null
  createdAt: string
  /**
   * The medal customers see (lib/tiers.ts shownTier): Bronze, Silver or Gold,
   * or null for none. Only this, never the garage's numbers, documents or
   * checks, and never whether admin hid it.
   */
  tier: Tier | null
}

/** Every key the public shape may carry, for tests and reviewers. */
export const PUBLIC_VENDOR_KEYS = [
  'id',
  'businessName',
  'logoUrl',
  'city',
  'pincode',
  'lat',
  'lng',
  'yearsInOperation',
  'isVerified',
  'status',
  'dropinEnabled',
  'doorstepEnabled',
  'doorstepRadiusKm',
  'pickupEnabled',
  'pickupRadiusKm',
  'doorstepWholeCity',
  'pickupWholeCity',
  'reachCity',
  'slotIntervalMins',
  'bookingsPausedAt',
  'bookingsPausedReason',
  'createdAt',
  'tier',
] as const satisfies ReadonlyArray<keyof PublicVendorFields>

/**
 * The whole-city facts customers may see (0069): which of the two options
 * apply, and the city they cover. `city` is the city the garage's pin is in
 * (lib/cities.ts wholeCityOf), or null.
 */
export function publicWholeCity(
  vendor: Pick<
    PublicVendorSource,
    'doorstepWholeCity' | 'pickupWholeCity' | 'pickup' | 'pickupRadiusKm' | 'pickupTermsAcceptedAt'
  >,
  city: CityPlace | null
): Pick<PublicVendorFields, 'doorstepWholeCity' | 'pickupWholeCity' | 'reachCity'> {
  const doorstepWholeCity = vendor.doorstepWholeCity && city !== null
  const pickupWholeCity = vendor.pickupWholeCity && city !== null && isPickupOffered(vendor)
  return {
    doorstepWholeCity,
    pickupWholeCity,
    reachCity:
      city && (doorstepWholeCity || pickupWholeCity)
        ? { name: city.name, lat: city.lat, lng: city.lng, reachKm: city.reachKm }
        : null,
  }
}

export function toPublicVendor(
  vendor: PublicVendorSource,
  extras: { tier: Tier | null; reachCity?: CityPlace | null }
): PublicVendorFields {
  return {
    id: vendor.id,
    businessName: vendor.businessName,
    logoUrl: vendor.logoUrl,
    city: vendor.city,
    pincode: vendor.pincode,
    lat: vendor.lat,
    lng: vendor.lng,
    yearsInOperation: vendor.yearsInOperation,
    isVerified: vendor.isVerified,
    status: vendor.status,
    dropinEnabled: vendor.dropinEnabled,
    doorstepEnabled: vendor.doorstepEnabled,
    doorstepRadiusKm: vendor.doorstepRadiusKm,
    pickupEnabled: isPickupOffered(vendor),
    pickupRadiusKm: vendor.pickupRadiusKm,
    ...publicWholeCity(vendor, extras.reachCity ?? null),
    slotIntervalMins: vendor.slotIntervalMins,
    bookingsPausedAt: vendor.bookingsPausedAt?.toISOString() ?? null,
    bookingsPausedReason: vendor.bookingsPausedReason,
    createdAt: vendor.createdAt.toISOString(),
    tier: extras.tier,
  }
}
