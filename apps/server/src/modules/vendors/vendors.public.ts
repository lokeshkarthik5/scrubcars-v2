/**
 * A garage as anyone may see it, signed in or not: GET /vendors/:id, the
 * garage page and checkout.
 *
 * An allow-list on purpose (owner decision, 17 Oct 2026): a customer gets a
 * garage's phone, WhatsApp, email and street address only once they have
 * booked it, from their own booking (GET /bookings/:id, toBookingResponse's
 * `vendor`), so nobody can find a garage here and then go round the app. So
 * this carries what the screens show before booking — name, logo, city and
 * pincode, the pin for the map, how it takes bookings and how far it goes,
 * whether it is paused and why — and nothing else. A new column on `vendors`
 * stays private until someone adds it here on purpose.
 *
 * Garage documents (0043) reach customers as one boolean, `documentsVerified`
 * (every required document approved by Detlio); never which documents, their
 * files or who checked them.
 *
 * Never here: phone, whatsapp, email, address, mapsUrl, notes (the admin's
 * ops note), ownerId, the raw pickup answer and who accepted its terms,
 * where the pin came from, bays and jobs per day. Admin and the garage's own
 * portal read the full row through their own endpoints.
 */
import { isPickupOffered } from '../../lib/pickup.js'
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
  | 'pickup'
  | 'pickupRadiusKm'
  | 'pickupTermsAcceptedAt'
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
  slotIntervalMins: number
  /**
   * Public on purpose: the garage page says "Not taking bookings right now",
   * with the reason when the owner gave one.
   */
  bookingsPausedAt: string | null
  bookingsPausedReason: string | null
  createdAt: string
  /**
   * Detlio has approved every required document (lib/vendor-documents.ts):
   * the "Documents verified" badge. Only this boolean, never the documents.
   * False while garage documents are off.
   */
  documentsVerified: boolean
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
  'slotIntervalMins',
  'bookingsPausedAt',
  'bookingsPausedReason',
  'createdAt',
  'documentsVerified',
] as const satisfies ReadonlyArray<keyof PublicVendorFields>

export function toPublicVendor(
  vendor: PublicVendorSource,
  extras: { documentsVerified: boolean }
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
    slotIntervalMins: vendor.slotIntervalMins,
    bookingsPausedAt: vendor.bookingsPausedAt?.toISOString() ?? null,
    bookingsPausedReason: vendor.bookingsPausedReason,
    createdAt: vendor.createdAt.toISOString(),
    documentsVerified: extras.documentsVerified,
  }
}
