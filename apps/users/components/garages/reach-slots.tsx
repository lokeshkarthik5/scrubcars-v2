'use client'

import { useState } from 'react'
import type { JustOutsideVendor } from '@repo/core/api/vendors'
import { requestActionLabel } from '@repo/core/booking-requests'
import type { BookingType } from '@repo/core/types'
import { FreeWashPiece } from '@/components/reach/free-wash'
import { RequestSheet } from '@/components/reach/request-sheet'

/**
 * Customer reach, part 2 (0062), in the places part 1 left for it, so the
 * list itself does not change.
 */

/**
 * Beside "See prices" on a "Just outside their area" card (Doorstep and
 * Pickup & drop): "Request a visit" / "Request a pickup", which opens the
 * request sheet. `mode` is the tab ('doorstep' or 'pickup').
 */
export function RequestActionSlot({
  garage,
  mode,
}: {
  garage: JustOutsideVendor
  mode: Extract<BookingType, 'doorstep' | 'pickup'>
}) {
  const [open, setOpen] = useState(false)
  const label = requestActionLabel(mode)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${label} from ${garage.vendor.name}`}
        className="press flex min-h-11 items-center rounded-full bg-brand-white px-4 text-[14px] font-medium text-brand-black"
      >
        {label}
      </button>
      {open && <RequestSheet open={open} onClose={() => setOpen(false)} garage={garage} mode={mode} />}
    </>
  )
}

/**
 * The bottom of the Pickup & drop tab, where the other tabs offer the next
 * one: "Free wash when we reach <Area>" while the customer's area has no
 * garage (or, once on its list, the slim line).
 */
export function FreeWashSlot() {
  return <FreeWashPiece placement="bottom" />
}
