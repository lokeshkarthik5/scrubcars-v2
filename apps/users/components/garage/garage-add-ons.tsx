'use client'

import { addOnCountLabel, addOnTimeLabel } from '@repo/core/add-ons'
import type { AddOn } from '@repo/core/api/add-ons'
import { Figures } from '@repo/ui/sc/figures'
import { AddOnMark } from '@repo/ui/sc/add-on-mark'
import { servicePriceText } from '@/lib/price'
import type { VehicleType } from '@repo/core/types'

/**
 * The garage's add-ons, under its services (frame C). Marked, and with no Add
 * button, so nobody takes one for a service: they're picked at checkout, and
 * Book Now still only appears once a service is added.
 */
export function GarageAddOns({
  addOns,
  carType,
}: {
  addOns: readonly AddOn[]
  carType: VehicleType | null
}) {
  return (
    <section
      aria-labelledby="garage-add-ons"
      className="mt-3 flex flex-col gap-3"
      data-garage-add-ons=""
    >
      <div className="flex items-center justify-between">
        <h2
          id="garage-add-ons"
          className="text-[17px] font-medium text-text-primary"
        >
          Add-ons
        </h2>
        <span className="text-[12px] text-text-secondary">
          {addOnCountLabel(addOns.length)}
        </span>
      </div>
      <p className="text-[13px] leading-relaxed text-text-secondary">
        Optional extras. Choose them at checkout, with any service. They
        can&apos;t be booked alone.
      </p>
      <ul className="hub-card flex flex-col divide-y divide-line px-4">
        {addOns.map((addOn) => (
          <li
            key={addOn.id}
            className="flex items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 text-[15px] text-text-primary">
                {addOn.name}
                <AddOnMark />
              </p>
              <p className="mt-0.5 text-[12px] text-text-secondary">
                <Figures text={addOnTimeLabel(addOn.extraMins)} />
              </p>
            </div>
            <span className="shrink-0 text-[15px] text-text-primary">
              <Figures text={servicePriceText(addOn, carType)} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
