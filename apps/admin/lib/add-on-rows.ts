import type { AddOn, AddOnInput } from '@repo/core/api/add-ons'

/** One row as typed. `id` is null until it has been saved. */
export interface AddOnRow {
  key: string
  id: string | null
  name: string
  extraMins: string
  hatch: string
  sedan: string
  suv: string
  isActive: boolean
}

export function addOnRowFrom(addOn: AddOn): AddOnRow {
  const price = (tier: number | null) =>
    String(addOn.pricingType === 'flat' ? addOn.price : (tier ?? ''))
  return {
    key: addOn.id,
    id: addOn.id,
    name: addOn.name,
    extraMins: addOn.extraMins > 0 ? String(addOn.extraMins) : '',
    hatch: price(addOn.priceHatchback),
    sedan: price(addOn.priceSedan),
    suv: price(addOn.priceSuv),
    isActive: addOn.isActive,
  }
}

/** All three the same is one flat price; anything else is per vehicle. */
export function addOnInputFrom(row: AddOnRow): AddOnInput | null {
  const name = row.name.trim()
  const [hatch, sedan, suv] = [
    Number(row.hatch),
    Number(row.sedan),
    Number(row.suv),
  ]
  if (!name || !(hatch > 0) || !(sedan > 0) || !(suv > 0)) return null
  const mins = row.extraMins.trim()
  if (
    mins !== '' &&
    !(
      Number.isInteger(Number(mins)) &&
      Number(mins) >= 0 &&
      Number(mins) <= 480
    )
  )
    return null
  return {
    name,
    ...(hatch === sedan && sedan === suv
      ? { pricingType: 'flat' as const, price: hatch }
      : {
          pricingType: 'per_vehicle' as const,
          priceHatchback: hatch,
          priceSedan: sedan,
          priceSuv: suv,
        }),
    extraMins: mins === '' ? null : Number(mins),
    isActive: row.isActive,
  }
}
