'use client'

import type { JustOutsideVendor } from '@repo/core/api/vendors'
import type { BookingType } from '@repo/core/types'

/**
 * Hooks for customer reach, part 2 (requests and the free wash). Part 1
 * renders these where they belong and they draw nothing yet; part 2 fills
 * them in here, so the list itself does not change.
 */

/**
 * Beside "See prices" on a "Just outside their area" card (Doorstep and
 * Pickup & drop): part 2's "Request a visit" / "Request a pickup" button.
 * `mode` is the tab ('doorstep' or 'pickup').
 */
export function RequestActionSlot(props: {
  garage: JustOutsideVendor
  mode: Extract<BookingType, 'doorstep' | 'pickup'>
}) {
  void props
  return null
}

/**
 * The bottom of the Pickup & drop tab, where the other tabs offer the next
 * one: part 2's "Free wash in your area" sign-up.
 */
export function FreeWashSlot() {
  return null
}
