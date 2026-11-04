'use client'

import { IconCheck, IconPlus } from '@tabler/icons-react'
import { ADD_ON_LIMITS, addOnTimeLabel } from '@repo/core/add-ons'
import type { AddOn } from '@repo/core/api/add-ons'
import { cn } from '@repo/core/utils'
import { Figures } from '@repo/ui/sc/figures'
import { servicePriceText } from '@/lib/price'
import type { VehicleType } from '@repo/core/types'

/** Checkout's Add-ons, right under "Your booking" (frame D). */
export function CheckoutAddOns({
  addOns,
  picked,
  vehicleType,
  onToggle,
}: {
  addOns: readonly AddOn[]
  picked: readonly string[]
  vehicleType: VehicleType | undefined
  onToggle: (addOnId: string) => void
}) {
  return (
    <section
      aria-labelledby="checkout-add-ons"
      className="flex flex-col gap-2"
      data-checkout-add-ons=""
    >
      <h2
        id="checkout-add-ons"
        className="text-[17px] font-medium text-text-primary"
      >
        Add-ons
      </h2>
      <p className="text-[13px] text-dim">
        Optional. They go with the services you&apos;ve chosen.
      </p>
      <ul className="hub-card flex flex-col divide-y divide-line px-4">
        {addOns.map((addOn) => {
          const added = picked.includes(addOn.id)
          // The server's limit: nothing more to add, but an added one comes off.
          const full = !added && picked.length >= ADD_ON_LIMITS.perBooking
          return (
            <li
              key={addOn.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="text-[15px] text-text-primary">{addOn.name}</p>
                <p className="mt-0.5 text-[13px] text-text-secondary">
                  <Figures text={servicePriceText(addOn, vehicleType)} />
                  {' · '}
                  <Figures text={addOnTimeLabel(addOn.extraMins)} />
                </p>
              </div>
              <button
                type="button"
                aria-pressed={added}
                disabled={full}
                aria-label={
                  added
                    ? `Remove ${addOn.name} from booking`
                    : `Add ${addOn.name} to booking`
                }
                onClick={() => onToggle(addOn.id)}
                className={cn(
                  'press flex min-h-11 disabled:opacity-50 shrink-0 items-center gap-1 rounded-full border px-4 text-[13px] font-medium transition-colors',
                  added
                    ? 'border-text-primary text-text-primary'
                    : 'border-white/20 text-text-primary'
                )}
              >
                {added ? (
                  <IconCheck size={15} aria-hidden="true" />
                ) : (
                  <IconPlus size={15} aria-hidden="true" />
                )}
                {added ? 'Added' : 'Add'}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
