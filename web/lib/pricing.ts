import type { PricingType, Service, VehicleType } from '@/lib/types'

export const PRICING_TYPES: Array<{ value: PricingType; label: string; hint: string }> = [
  { value: 'flat', label: 'Flat', hint: 'One fixed price' },
  { value: 'per_vehicle', label: 'Per vehicle', hint: 'Price per vehicle type' },
  { value: 'on_inspection', label: 'On inspection', hint: 'Upfront inspection fee; final work quoted after' },
]

/**
 * Label for a booking's charge. Every pricing type has a concrete amount now,
 * so this just formats it.
 */
export function formatBookingAmount(amount: number): string {
  return `₹${amount}`
}

/** The tier price for a given vehicle type, or null if that tier isn't set. */
export function tierPriceFor(
  service: Pick<Service, 'priceHatchback' | 'priceSedan' | 'priceSuv'>,
  vehicleType: VehicleType
): number | null {
  const byTier: Record<VehicleType, number | null> = {
    hatchback: service.priceHatchback,
    sedan: service.priceSedan,
    suv: service.priceSuv,
  }
  return byTier[vehicleType]
}

/**
 * The concrete amount to charge for a service given the customer's vehicle, or
 * null when a per-vehicle service has no price for that tier.
 *
 * Null rather than a fallback, matching computeServiceAmount on the server:
 * `price` is the cheapest tier, so falling back to it would quote an SUV the
 * hatchback rate and the booking would then be refused anyway.
 */
export function resolveServiceAmount(
  service: Service,
  vehicleType?: VehicleType
): number | null {
  if (service.pricingType === 'per_vehicle' && vehicleType) {
    return tierPriceFor(service, vehicleType)
  }
  return service.price
}

/**
 * A short human label for a service's price, e.g. "₹300", "₹200 inspection",
 * or — for a per-vehicle service with no vehicle in context — the span its
 * tiers cover ("₹300–₹500").
 *
 * Deliberately compact: this sits in the price slot of list cards and the
 * sticky booking bar, where a full "Hatch ₹300 · Sedan ₹400 · SUV ₹500" would
 * crowd out the service name on a phone. The itemised breakdown belongs in the
 * details popup, which has the room for it.
 */
export function formatServicePrice(
  service: Service,
  vehicleType?: VehicleType
): string {
  switch (service.pricingType) {
    case 'on_inspection':
      return `₹${service.price} inspection`
    case 'per_vehicle': {
      if (vehicleType) {
        const amount = tierPriceFor(service, vehicleType)
        return amount == null ? 'Price on request' : `₹${amount}`
      }
      const tiers = [
        service.priceHatchback,
        service.priceSedan,
        service.priceSuv,
      ].filter((t): t is number => t != null)

      if (tiers.length === 0) return `from ₹${service.price}`

      const low = Math.min(...tiers)
      const high = Math.max(...tiers)
      return low === high ? `₹${low}` : `₹${low}–₹${high}`
    }
    case 'flat':
    default:
      return `₹${service.price}`
  }
}
