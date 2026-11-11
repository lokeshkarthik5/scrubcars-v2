'use client'

import { ADD_ON_LIMITS, addOnTimeLabel } from '@repo/core/add-ons'
import type { AddOn } from '@repo/core/api/add-ons'
import { Figures } from '@repo/ui/sc/figures'
import { RedLightAdd } from '@/components/garage/red-light-add'
import { servicePriceText } from '@/lib/price'
import type { VehicleType } from '@repo/core/types'
import { useT } from '@repo/core/i18n'

/**
 * Checkout's Add-ons (0068), each with the red-light Add of the garage page
 * (customer UI round, §6): a row per add-on, its price and the time it adds,
 * and Add → Added with the light switched on.
 */
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
  const t = useT()
  return (
    <section
      aria-labelledby="checkout-add-ons"
      className="flex flex-col gap-2"
      data-checkout-add-ons=""
    >
      <h2
        id="checkout-add-ons"
        className="text-t2 font-semibold text-text-primary"
      >
        {t('Add-ons')}
      </h2>
      <p className="-mt-1 text-t5 font-medium text-[#8E8E98]">
        {t("Optional. They go with the services you've chosen.")}
      </p>
      <ul className="flex flex-col gap-2">
        {addOns.map((addOn) => {
          const added = picked.includes(addOn.id)
          // The server's limit: nothing more to add, but an added one comes off.
          const full = !added && picked.length >= ADD_ON_LIMITS.perBooking
          return (
            <li
              key={addOn.id}
              className="flex items-center justify-between gap-2.5 rounded-[18px] border border-white/[0.07] bg-[#111114] py-2.5 pl-3.5 pr-2.5"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-[14px] font-semibold text-text-primary">{addOn.name}</p>
                <p className="font-numeric text-t5 font-medium text-[#8E8E98]">
                  <Figures text={servicePriceText(addOn, vehicleType)} />
                  {' · '}
                  <Figures text={addOnTimeLabel(addOn.extraMins)} />
                </p>
              </div>
              <RedLightAdd
                name={addOn.name}
                added={added}
                disabled={full}
                fly={false}
                onToggle={() => onToggle(addOn.id)}
              />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
