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
 * The concrete amount to charge for a service given the customer's vehicle.
 * 'on_inspection' resolves to its firm upfront inspection fee.
 */
export function resolveServiceAmount(
  service: Service,
  vehicleType?: VehicleType
): number | null {
  if (service.pricingType === 'per_vehicle' && vehicleType) {
    return tierPriceFor(service, vehicleType) ?? service.price
  }
  return service.price
}

/**
 * A short human label for a service's price, e.g. "₹300", "₹200 inspection",
 * or a per-vehicle breakdown. When a vehicleType is given for a per-vehicle
 * service, shows that tier's resolved price instead.
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
        const amount = tierPriceFor(service, vehicleType) ?? service.price
        return `₹${amount}`
      }
      const tiers = [
        service.priceHatchback != null ? `Hatch ₹${service.priceHatchback}` : null,
        service.priceSedan != null ? `Sedan ₹${service.priceSedan}` : null,
        service.priceSuv != null ? `SUV ₹${service.priceSuv}` : null,
      ].filter(Boolean)
      return tiers.length > 0 ? tiers.join(' · ') : `from ₹${service.price}`
    }
    case 'flat':
    default:
      return `₹${service.price}`
  }
}
