// Per-service pricing helpers shared by the vendor and admin service layers,
// the booking amount calculation, and the public listing "from ₹X" price.
//
// Pricing types (all firm, all prepaid online via Razorpay):
//   flat          – one fixed price (`price`)
//   per_vehicle   – a price per vehicle tier; `price` holds the cheapest tier
//   on_inspection – a vendor-set upfront inspection fee (`price`); the final
//                   service is quoted after inspection, but the fee is firm

export type ServicePricingType = 'flat' | 'per_vehicle' | 'on_inspection'

export type VehicleTier = 'hatchback' | 'sedan' | 'suv'

export interface PricingInput {
  pricingType: ServicePricingType
  price?: number
  priceHatchback?: number
  priceSedan?: number
  priceSuv?: number
}

// Decimal columns are stored as strings; null tiers are absent.
export interface PricingColumns {
  pricingType: ServicePricingType
  price: string
  priceHatchback: string | null
  priceSedan: string | null
  priceSuv: string | null
}

const money = (n: number): string => n.toFixed(2)
const tier = (n: number | undefined): string | null =>
  typeof n === 'number' ? money(n) : null

/**
 * Turn validated pricing input into the columns to persist. Assumes the input
 * already passed schema validation (e.g. per_vehicle has at least one tier).
 */
export function resolveServicePricing(input: PricingInput): PricingColumns {
  const pricingType = input.pricingType

  if (pricingType === 'per_vehicle') {
    const tiers = [input.priceHatchback, input.priceSedan, input.priceSuv].filter(
      (t): t is number => typeof t === 'number' && t > 0
    )
    // Base price is the cheapest tier so the listing "from" math still works.
    const base = tiers.length > 0 ? Math.min(...tiers) : 0
    return {
      pricingType,
      price: money(base),
      priceHatchback: tier(input.priceHatchback),
      priceSedan: tier(input.priceSedan),
      priceSuv: tier(input.priceSuv),
    }
  }

  // flat | on_inspection – a single price, no tiers.
  return {
    pricingType,
    price: money(input.price ?? 0),
    priceHatchback: null,
    priceSedan: null,
    priceSuv: null,
  }
}

interface PricedService {
  pricingType: ServicePricingType
  price: string
  priceHatchback: string | null
  priceSedan: string | null
  priceSuv: string | null
}

/** The tier prices of a service, as stored. */
export function tiersOf(
  service: PricedService
): Record<VehicleTier, string | null> {
  return {
    hatchback: service.priceHatchback,
    sedan: service.priceSedan,
    suv: service.priceSuv,
  }
}

/**
 * The amount to charge for a booking of `service` for a given vehicle tier.
 * Returns a decimal string, or null when a per-vehicle service has no price
 * for that tier.
 *
 * Null rather than a fallback on purpose: `price` holds the *cheapest* tier, so
 * falling back to it would quietly bill an SUV at the hatchback rate. Callers
 * must refuse the booking instead. New services can't hit this — validation
 * requires all three tiers — but rows created before that rule still can.
 */
export function computeServiceAmount(
  service: PricedService,
  vehicleType: VehicleTier
): string | null {
  if (service.pricingType === 'per_vehicle') {
    return tiersOf(service)[vehicleType]
  }

  // flat | on_inspection both use the stored base (inspection) price.
  return service.price
}

/**
 * The lowest concrete price across a vendor's services, for the listing card.
 * Returns null if no service has a positive price.
 */
export function computeStartingPrice(
  services: Array<{ pricingType: ServicePricingType; price: string }>
): number | null {
  const prices = services
    .map((s) => Number(s.price))
    .filter((n) => Number.isFinite(n) && n > 0)
  return prices.length > 0 ? Math.min(...prices) : null
}
