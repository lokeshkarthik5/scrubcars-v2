// Per-service pricing helpers shared by the vendor and admin service layers,
// the booking amount calculation, and the public listing "from ₹X" price.
//
// Pricing types (all firm, all prepaid online via Razorpay):
//   flat          – one fixed price (`price`)
//   per_vehicle   – a price per vehicle tier; `price` holds the cheapest tier
//   on_inspection – an optional vendor-set upfront inspection fee (`price`,
//                   0 for none since 0073); the job is quoted after
//                   inspection with the final bill (lib/final-bill.ts). An
//                   optional `approx_price` is a guide only, never charged.

export type ServicePricingType = 'flat' | 'per_vehicle' | 'on_inspection'

export type VehicleTier = 'hatchback' | 'sedan' | 'suv'

export interface PricingInput {
  pricingType: ServicePricingType
  price?: number
  priceHatchback?: number
  priceSedan?: number
  priceSuv?: number
  /** On inspection only (0073); null or left out is none. */
  approxPrice?: number | null
}

// Decimal columns are stored as strings; null tiers are absent.
export interface PricingColumns {
  pricingType: ServicePricingType
  price: string
  priceHatchback: string | null
  priceSedan: string | null
  priceSuv: string | null
  /**
   * Null unless on inspection with an approx price (0073). Always written by
   * resolveServicePricing; optional so readers that only price a booking
   * (home cards, slots) needn't select it.
   */
  approxPrice?: string | null
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
      approxPrice: null,
    }
  }

  // flat | on_inspection – a single price, no tiers. On inspection the fee
  // may be left out: 0 is a free inspection (0073).
  return {
    pricingType,
    price: money(input.price ?? 0),
    priceHatchback: null,
    priceSedan: null,
    priceSuv: null,
    approxPrice:
      pricingType === 'on_inspection' && typeof input.approxPrice === 'number' && input.approxPrice > 0
        ? money(input.approxPrice)
        : null,
  }
}

/**
 * The pricing columns a partial service update writes (vendor PATCH, admin
 * save). A new pricing type rewrites the whole block (type, base price, every
 * tier) so stale values can't linger; the approx price, which an older client
 * never sends, is kept as stored when left out and the type stays on
 * inspection. Without a type only the fields sent change: a fee of 0 is only
 * for a service already on inspection, and an approx price only lands on one
 * (null clears it).
 *
 * Returns the columns, or 'price_required' for a ₹0 price on a service that
 * is not priced on inspection.
 */
export function pricingUpdateColumns(
  input: PricingInput | (Partial<PricingInput> & { pricingType?: undefined }),
  storedType: ServicePricingType
): Partial<PricingColumns> | 'price_required' {
  if (input.pricingType !== undefined) {
    const columns: Partial<PricingColumns> = resolveServicePricing(input as PricingInput)
    if (input.pricingType === 'on_inspection' && input.approxPrice === undefined) {
      delete columns.approxPrice
    }
    return columns
  }
  const columns: Partial<PricingColumns> = {}
  if (input.price !== undefined) {
    if (!(input.price > 0) && storedType !== 'on_inspection') return 'price_required'
    columns.price = money(input.price)
  }
  if (input.approxPrice !== undefined && storedType === 'on_inspection') {
    columns.approxPrice =
      typeof input.approxPrice === 'number' && input.approxPrice > 0 ? money(input.approxPrice) : null
  }
  return columns
}

/**
 * On inspection with no fee (0073): booked with nothing paid, priced whole
 * by the final bill. Core's twin is `isNoFeeInspection` in
 * packages/core/src/pricing.ts.
 */
export function isNoFeeInspection(service: { pricingType: string; price: string | number }): boolean {
  return service.pricingType === 'on_inspection' && !(Number(service.price) > 0)
}

export interface PricedService {
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
 * Add rupee amounts that are stored as decimal strings.
 *
 * Money is `numeric(10,2)` throughout and carried as strings. Summing them as
 * floats works until it doesn't — 0.1 + 0.2 is the standard example — and a
 * booking total a paisa off its own line items is the kind of bug that only
 * surfaces in a reconciliation months later. Shared by the booking draft and
 * the discount preview so the two can never compute different subtotals for
 * the same cart.
 */
export function sumAmounts(amounts: string[]): string {
  const paise = amounts.reduce(
    (total, value) => total + Math.round(Number(value) * 100),
    0
  )
  return (paise / 100).toFixed(2)
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

/**
 * A checkout with nothing to pay because its on-inspection service has no fee
 * (0073): an inspection line, and the whole booking (services, any travel fee)
 * comes to ₹0 with no code. Booked like a free wash, with no Razorpay order at
 * all (booking-intents.service), never a ₹0 order; the garage's final bill is
 * then the whole price. An add-on or any other priced line makes it a normal
 * paid checkout.
 */
export function isNoFeeInspectionCheckout(input: {
  pricingTypes: ReadonlyArray<string>
  /** The booking's total before any code (services and travel fee). */
  amount: string
  chargeAmount: string
}): boolean {
  const zero = (value: string) => Math.round(Number(value) * 100) === 0
  return input.pricingTypes.includes('on_inspection') && zero(input.amount) && zero(input.chargeAmount)
}

/**
 * What a checkout consumed with no payment and no credit may be
 * (booking-intents.repository consumeIntent): a free wash (0062), when it
 * names a code (checked to be one under the discount lock), or an inspection
 * with no fee (0073), when its services came to ₹0 with no code (createIntent
 * checked the line is one). Null: nothing paid for a booking that costs
 * something, which is never written.
 */
export function nothingPaidCheckoutKind(intent: {
  subtotalAmount: string
  discountId: string | null
}): 'free_wash' | 'no_fee_inspection' | null {
  if (intent.discountId) return 'free_wash'
  return Math.round(Number(intent.subtotalAmount) * 100) === 0 ? 'no_fee_inspection' : null
}
