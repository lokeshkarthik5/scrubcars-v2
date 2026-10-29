/**
 * A garage's street address is needed only for at-garage bookings (owner,
 * 28 Oct 2026): customers drive in, so they need to know where to. A
 * doorstep-only garage goes to the customer and needs only its map pin, so
 * its address and pincode may be empty ('' in the NOT NULL columns).
 *
 * - Creating or changing a garage refuses an at-garage one with no address
 *   or no 6-digit pincode only when the request itself sets it that way
 *   (admin.service, vendors.service); a garage already short of one shows
 *   the blocking "No address for at-garage customers" on its checklist
 *   (lib/vendor-readiness.ts) until it is filled in.
 * - Anything that shows the address falls back to the city when it is
 *   empty (garageAddressLine; the receipt does the same).
 *
 * Pure.
 */

export const PINCODE_PATTERN = /^\d{6}$/

export function isPincode(value: string | null | undefined): boolean {
  return PINCODE_PATTERN.test((value ?? '').trim())
}

/** At-garage on, and the address or the pincode is missing. */
export function atGarageAddressMissing(garage: {
  dropinEnabled: boolean
  address?: string | null
  pincode?: string | null
}): boolean {
  return garage.dropinEnabled && (!(garage.address ?? '').trim() || !isPincode(garage.pincode))
}

/**
 * The address as one line: "12, Main Road, Chennai", or the city alone when
 * the garage has no street address (doorstep only). Empty when it has
 * neither.
 */
export function garageAddressLine(garage: { address?: string | null; city?: string | null }): string {
  const street = (garage.address ?? '').trim()
  const city = (garage.city ?? '').trim()
  if (!street) return city
  if (!city || street.toLowerCase().includes(city.toLowerCase())) return street
  return `${street}, ${city}`
}

/** What a refusal says when an at-garage garage would be left without one. */
export const AT_GARAGE_ADDRESS_MESSAGE =
  'A garage that takes cars at the garage needs its address and a 6-digit pincode. Add them, or switch it to doorstep only.'

/**
 * Whether a change must be refused: it touches at-garage, the address or the
 * pincode, and leaves an at-garage garage without a full address. A change
 * that touches none of them is never refused here, so a garage already short
 * of one can still have its phone fixed (its checklist says what is missing).
 */
export function atGarageAddressRefused(
  before: { dropinEnabled: boolean; address: string | null; pincode: string | null },
  patch: { dropinEnabled?: boolean; address?: string | null; pincode?: string | null }
): boolean {
  const touched =
    patch.dropinEnabled !== undefined || patch.address !== undefined || patch.pincode !== undefined
  if (!touched) return false
  return atGarageAddressMissing({
    dropinEnabled: patch.dropinEnabled ?? before.dropinEnabled,
    address: patch.address !== undefined ? patch.address : before.address,
    pincode: patch.pincode !== undefined ? patch.pincode : before.pincode,
  })
}
