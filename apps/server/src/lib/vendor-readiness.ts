/**
 * What a garage still needs before it can take bookings properly: the admin
 * garage list's "what's missing" checklist. Pure, so every rule is pinned by
 * vendor-readiness.test.ts rather than read off a screen.
 *
 * Three levels (owner decision):
 *
 *   blocking  customers cannot book it at all until this is done: no
 *             services, no booking type switched on, or no open day.
 *   fix       it works, but something is wrong or missing that should be put
 *             right soon: the map pin, service descriptions, car types, bays.
 *   optional  nice to have: a logo, photos, a doorstep travel radius (empty
 *             means the 10 km default, which the owner is happy with), a
 *             pickup radius (the same 10 km default).
 *
 * Pickup & drop (0037) adds two fix items: pickup on with no map pin (the
 * radius is measured from it, so no customer can be matched), and a garage
 * that answered yes to pickup at onboarding but has not accepted the
 * responsibility terms, so it is not on.
 *
 * Only blocking and fix count as "needs fixing"; a garage with nothing but
 * optional items is Ready.
 *
 * Deliberately not checked: distance from Chennai (the owner allows garages
 * in other towns, and the out-of-town sign is its own change), whether the
 * garage is verified (that is the Verify button, not a form to fill), and the
 * stage (Pending, Archived…), which the list's chips already say.
 */

import { DEFAULT_PICKUP_RADIUS_KM, isPickupOffered, type VendorPickupAnswer } from './pickup.js'

export type ReadinessSeverity = 'blocking' | 'fix' | 'optional'

/** The edit page tab where each item is fixed (its `?tab=` allow-list). */
export type ReadinessTab = 'details' | 'location' | 'operations' | 'services'

export interface ReadinessItem {
  key: string
  severity: ReadinessSeverity
  /** The checklist row: "No services". */
  label: string
  /** A quieter second line, when the label needs one. */
  detail?: string
  /** A word or two for the card's summary: "1 to fix: map pin". */
  short: string
  tab: ReadinessTab
}

/** What the checklist reads about one garage. */
export interface ReadinessInput {
  dropinEnabled: boolean
  doorstepEnabled: boolean
  doorstepRadiusKm: number | null
  /** The garage drew its own doorstep area, which then replaces the radius. */
  hasDoorstepArea: boolean
  /** Pickup & drop: the stored answer, radius and terms (lib/pickup.ts). */
  pickup: VendorPickupAnswer | null
  pickupRadiusKm: number | null
  pickupTermsAcceptedAt: Date | string | null
  lat: number | null
  lng: number | null
  geoConfirmedAt: Date | string | null
  logoUrl: string | null
  bays: number | null
  vehicleTypes: string[]
  photoCount: number
  /** Its live plain services: active, packages left out, as everywhere in admin. */
  services: Array<{ description: string | null }>
  /** Its weekly rows. A day with no row is closed, as slots.ts reads it. */
  workingHours: Array<{ isClosed: boolean }>
}

/**
 * How far a doorstep garage with no radius travels. The owner's default, the
 * same 10 km the admin editor quotes (apps/admin/lib/garage-edit.ts).
 */
export const DEFAULT_DOORSTEP_RADIUS_KM = 10

/**
 * The car types a garage can still say it takes, compared without case or
 * spaces: the seeds and some older rows store "hatchback", "suv", and the
 * checklist offers "SUV / MUV". Anything else ("Luxury / Premium",
 * "Electric (EV)", "Commercial / Van") was retired from the checklist,
 * because no service can be priced for it (packages/core/src/vehicles.ts).
 */
const CURRENT_VEHICLE_TYPES = new Set(['hatchback', 'sedan', 'suv/muv', 'suv'])

const normaliseVehicleType = (value: string) => value.toLowerCase().replace(/\s+/g, '')

/** Stored car types the checklist no longer offers, as stored. */
export function retiredVehicleTypes(stored: string[]): string[] {
  return stored.filter((t) => !CURRENT_VEHICLE_TYPES.has(normaliseVehicleType(t)))
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The garage's checklist, blocking first, then fix, then optional. */
export function vendorReadiness(v: ReadinessInput): ReadinessItem[] {
  const items: ReadinessItem[] = []

  // ─── Blocking: nothing can be booked ──────────────────────────────────────

  if (v.services.length === 0) {
    items.push({
      key: 'no_services',
      severity: 'blocking',
      label: 'No services',
      detail: 'Nothing for customers to book',
      short: 'services',
      tab: 'services',
    })
  }

  if (!v.dropinEnabled && !v.doorstepEnabled) {
    items.push({
      key: 'no_booking_type',
      severity: 'blocking',
      label: 'No booking type switched on',
      detail: 'Pick At the garage, Doorstep or Both',
      short: 'booking type',
      tab: 'operations',
    })
  }

  // No rows at all is how a garage added without hours looks; every row
  // closed is a week of days off. Either way there is no time to book.
  if (!v.workingHours.some((day) => !day.isClosed)) {
    items.push({
      key: 'no_hours',
      severity: 'blocking',
      label: 'No opening hours',
      detail:
        v.workingHours.length === 0
          ? 'No days set, so there are no times to book'
          : 'Closed every day, so there are no times to book',
      short: 'opening hours',
      tab: 'operations',
    })
  }

  // ─── Fix: works, but put it right soon ────────────────────────────────────

  if (v.lat === null || v.lng === null) {
    items.push({
      key: 'no_pin',
      severity: 'fix',
      label: 'No map pin',
      detail: 'Customers can’t see how far away it is',
      short: 'map pin',
      tab: 'location',
    })
  } else if (!v.geoConfirmedAt) {
    items.push({
      key: 'pin_unconfirmed',
      severity: 'fix',
      label: 'Map pin not confirmed',
      detail: 'Check the pin sits on the garage',
      short: 'map pin',
      tab: 'location',
    })
  }

  const undescribed = v.services.filter((s) => !s.description?.trim()).length
  if (undescribed > 0) {
    items.push({
      key: 'no_descriptions',
      severity: 'fix',
      label: `${plural(undescribed, 'service')} without a description`,
      detail: 'Customers see only the name',
      short: 'service descriptions',
      tab: 'services',
    })
  }

  const retired = retiredVehicleTypes(v.vehicleTypes)
  if (v.vehicleTypes.length === 0) {
    items.push({
      key: 'no_vehicle_types',
      severity: 'fix',
      label: 'No car types',
      detail: 'Pick the car sizes it takes',
      short: 'car types',
      tab: 'operations',
    })
  } else if (retired.length > 0) {
    items.push({
      key: 'retired_vehicle_types',
      severity: 'fix',
      label: 'Car types no longer offered',
      detail: retired.join(', '),
      short: 'car types',
      tab: 'operations',
    })
  }

  const pickupOn = isPickupOffered(v)
  if (pickupOn && (v.lat === null || v.lng === null)) {
    items.push({
      key: 'pickup_no_pin',
      severity: 'fix',
      label: 'Pickup & drop on, no map pin',
      detail: 'The pickup radius is measured from the pin, so no customer can book it',
      short: 'pickup pin',
      tab: 'location',
    })
  }

  // A yes from onboarding before the terms existed: not on, and the panel's
  // switch says off, which would otherwise read as the garage's choice.
  if (!pickupOn && (v.pickup === 'yes' || v.pickup === 'nearby')) {
    items.push({
      key: 'pickup_terms_missing',
      severity: 'fix',
      label: 'Pickup & drop not agreed',
      detail: 'Said yes at onboarding, but has not accepted responsibility for the car',
      short: 'pickup agreement',
      tab: 'operations',
    })
  }

  // Empty (or 0) bays is read as one car at a time (lib/slots.ts), which may
  // be less than the garage can take.
  if (!v.bays) {
    items.push({
      key: 'no_bays',
      severity: 'fix',
      label: 'Bays not set',
      detail: 'Taken as 1 car at a time',
      short: 'bays',
      tab: 'operations',
    })
  }

  // ─── Optional ─────────────────────────────────────────────────────────────

  // A drawn area replaces the radius, so it is not missing then.
  if (v.doorstepEnabled && v.doorstepRadiusKm == null && !v.hasDoorstepArea) {
    items.push({
      key: 'no_doorstep_radius',
      severity: 'optional',
      label: 'Doorstep on, no travel radius',
      detail: `Default ${DEFAULT_DOORSTEP_RADIUS_KM} km used`,
      short: 'travel radius',
      tab: 'operations',
    })
  }

  if (pickupOn && v.pickupRadiusKm == null) {
    items.push({
      key: 'no_pickup_radius',
      severity: 'optional',
      label: 'Pickup & drop on, no pickup radius',
      detail: `Default ${DEFAULT_PICKUP_RADIUS_KM} km used`,
      short: 'pickup radius',
      tab: 'operations',
    })
  }

  if (!v.logoUrl) {
    items.push({ key: 'no_logo', severity: 'optional', label: 'No logo', short: 'logo', tab: 'details' })
  }

  if (v.photoCount === 0) {
    items.push({ key: 'no_photos', severity: 'optional', label: 'No photos', short: 'photos', tab: 'details' })
  }

  return items
}
