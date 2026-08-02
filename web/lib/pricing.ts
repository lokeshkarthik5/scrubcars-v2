import type { PricingType, Service, VehicleType } from '@/lib/types'

export const PRICING_TYPES: Array<{ value: PricingType; label: string; hint: string }> = [
  { value: 'flat', label: 'Flat', hint: 'One fixed price' },
  { value: 'per_vehicle', label: 'Per vehicle', hint: 'Price per vehicle type' },
  { value: 'from', label: 'From', hint: 'A starting price (pay later)' },
  { value: 'on_inspection', label: 'On inspection', hint: 'Quoted after inspection (pay later)' },
]

/**
 * Label for a booking's charge. 'on_inspection' has no upfront amount, so it
 * reads "Quoted on site" instead of ₹0. Everything else shows the amount.
 */
export function formatBookingAmount(
  amount: number,
  pricingType?: PricingType
): string {
  if (pricingType === 'on_inspection') return 'Quoted on site'
  return `₹${amount}`
}

/** 'from' and 'on_inspection' are pay-later only — no online (Razorpay) prepay. */
export function supportsOnlinePayment(pricingType: PricingType): boolean {
  return pricingType === 'flat' || pricingType === 'per_vehicle'
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
 * Returns null for 'on_inspection' (no upfront amount).
 */
export function resolveServiceAmount(
  service: Service,
  vehicleType?: VehicleType
): number | null {
  if (service.pricingType === 'on_inspection') return null
  if (service.pricingType === 'per_vehicle' && vehicleType) {
    return tierPriceFor(service, vehicleType) ?? service.price
  }
  return service.price
}

/**
 * A short human label for a service's price, e.g. "₹300", "from ₹500",
 * "On inspection", or a per-vehicle breakdown. When a vehicleType is given for
 * a per-vehicle service, shows that tier's resolved price instead.
 */
export function formatServicePrice(
  service: Service,
  vehicleType?: VehicleType
): string {
  switch (service.pricingType) {
    case 'on_inspection':
      return 'On inspection'
    case 'from':
      return `from ₹${service.price}`
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
