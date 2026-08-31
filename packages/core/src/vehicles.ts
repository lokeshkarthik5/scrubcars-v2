import type { VehicleType } from '@repo/core/types'

/**
 * The vehicle tiers the platform can actually book and price.
 *
 * This list is the whole taxonomy, not a subset of one: `vehicle_type` is a
 * three-value enum in the database, so a customer can only ever register a
 * hatchback, sedan or SUV, and a service prices exactly these three tiers.
 * Everything that asks about vehicles — the customer's garage, a service's
 * per-vehicle prices, a vendor's declared coverage — reads from here, so the
 * three views can't drift apart and promise a vehicle the app can't book.
 *
 * Adding a tier (EV, commercial van…) is a schema change: a new enum value plus
 * a new price column on `services`, not just a new entry in this array.
 */
export const VEHICLE_TIERS: Array<{ value: VehicleType; label: string }> = [
  { value: 'hatchback', label: 'Hatchback' },
  { value: 'sedan', label: 'Sedan' },
  { value: 'suv', label: 'SUV / MUV' },
]

/**
 * The vendor-facing "vehicle types handled" checklist. Stored as free-text
 * labels on `vendors.vehicle_types`, so it stays in step with the tiers above
 * rather than offering categories no service can be priced for.
 */
export const VENDOR_VEHICLE_TYPE_OPTIONS = VEHICLE_TIERS.map((t) => t.label)

/**
 * Labels a vendor already has stored that are no longer offered — earlier
 * versions of the checklist included "Luxury / Premium", "Electric (EV)" and
 * "Commercial / Van". Surfaced as removable chips rather than dropped silently,
 * so an admin can see and clear what is on the record.
 */
export function legacyVehicleTypes(stored: string[]): string[] {
  return stored.filter((t) => !VENDOR_VEHICLE_TYPE_OPTIONS.includes(t))
}
