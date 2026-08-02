// Per-service pricing helpers shared by the vendor and admin service layers,
// the booking amount calculation, and the public listing "from ₹X" price.
//
// Pricing types:
//   flat          – one fixed price (`price`)
//   per_vehicle   – a price per vehicle tier; `price` holds the cheapest tier
//   from          – a starting price (`price`)
//   on_inspection – no upfront price; `price` is stored as 0

export type ServicePricingType = 'flat' | 'per_vehicle' | 'from' | 'on_inspection'

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

  if (pricingType === 'on_inspection') {
    return {
      pricingType,
      price: money(0),
      priceHatchback: null,
      priceSedan: null,
      priceSuv: null,
    }
  }

  // flat | from – a single price, no tiers.
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

/**
 * The amount to charge for a booking of `service` for a given vehicle tier.
 * Returns a decimal string. 'on_inspection' resolves to '0.00' (quoted off-app).
 */
export function computeServiceAmount(
  service: PricedService,
  vehicleType: VehicleTier
): string {
  if (service.pricingType === 'per_vehicle') {
    const byTier: Record<VehicleTier, string | null> = {
      hatchback: service.priceHatchback,
      sedan: service.priceSedan,
      suv: service.priceSuv,
    }
    // Fall back to the base (cheapest tier) if this tier wasn't priced.
    return byTier[vehicleType] ?? service.price
  }

  // flat | from | on_inspection all use the stored base price.
  return service.price
}

/**
 * Whether a service can be paid online (Razorpay). 'from' and 'on_inspection'
 * have no firm upfront amount, so they are pay-later (cash) only.
 */
export function supportsOnlinePayment(pricingType: ServicePricingType): boolean {
  return pricingType === 'flat' || pricingType === 'per_vehicle'
}

/**
 * The lowest concrete price across a vendor's services, for the listing card.
 * Ignores 'on_inspection' services (no upfront price). Returns null if none.
 */
export function computeStartingPrice(
  services: Array<{ pricingType: ServicePricingType; price: string }>
): number | null {
  const prices = services
    .filter((s) => s.pricingType !== 'on_inspection')
    .map((s) => Number(s.price))
    .filter((n) => Number.isFinite(n) && n > 0)
  return prices.length > 0 ? Math.min(...prices) : null
}
