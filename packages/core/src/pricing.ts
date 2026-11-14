import type { PricingType, Service, VehicleType } from '@repo/core/types'
import { formatINR } from './format'
import { msg, t } from './i18n/translate'

export const PRICING_TYPES: Array<{ value: PricingType; label: string; hint: string }> = [
  { value: 'flat', label: 'Flat', hint: 'One fixed price' },
  { value: 'per_vehicle', label: 'Per vehicle', hint: 'Price per vehicle type' },
  { value: 'on_inspection', label: 'On inspection', hint: 'Priced after seeing the car; inspection fee optional' },
]

/**
 * A package priced on inspection keeps its fee required (0073 made it optional
 * on services only), so its form says so instead of PRICING_TYPES' hint.
 */
export const PACKAGE_INSPECTION_HINT = msg('Upfront inspection fee; final work quoted after')

/** The hint under the pricing chips: a package on inspection has its own. */
export function pricingHint(pricingType: PricingType, forPackage = false): string {
  if (forPackage && pricingType === 'on_inspection') return PACKAGE_INSPECTION_HINT
  return PRICING_TYPES.find((pt) => pt.value === pricingType)?.hint ?? ''
}

/**
 * Label for a booking's charge. Every pricing type has a concrete amount now,
 * so this just formats it.
 */
export function formatBookingAmount(amount: number): string {
  return `₹${amount}`
}

/** What pricing reads: a service's fields, or an add-on's (0068). */
export type PricedFields = Pick<Service, 'pricingType' | 'price' | 'priceHatchback' | 'priceSedan' | 'priceSuv'> &
  Partial<Pick<Service, 'approxPrice'>>

/** What the inspection words read. */
export type InspectionFields = Pick<Service, 'pricingType' | 'price'> & Partial<Pick<Service, 'approxPrice'>>

/**
 * On inspection with no fee (owner, 12 Nov 2026): the garage prices the job
 * once it has seen the car, and nothing is paid at booking. Its `price` is 0.
 * The server's twin is `isNoFeeInspection` in apps/server/src/lib/pricing.ts.
 */
export function isNoFeeInspection(service: InspectionFields): boolean {
  return service.pricingType === 'on_inspection' && !(Number(service.price) > 0)
}

/**
 * The garage's optional rough price for an inspection job (0073), or null.
 * Only an on-inspection service has one; it is a guide, never charged.
 */
export function inspectionApprox(service: InspectionFields): number | null {
  if (service.pricingType !== 'on_inspection') return null
  const approx = Number(service.approxPrice)
  return service.approxPrice != null && Number.isFinite(approx) && approx > 0 ? approx : null
}

/**
 * The approx line, "Approx ₹1,500 · price after inspection", or null when
 * the garage gave no approx price. Shown under an inspection fee, or as the
 * price itself when there is no fee (noFeeInspectionText).
 */
export function inspectionApproxLine(
  service: InspectionFields,
  format: (amount: number) => string = formatINR
): string | null {
  const approx = inspectionApprox(service)
  return approx === null ? null : t('Approx {amount} · price after inspection', { amount: format(approx) })
}

/**
 * The price slot of a no-fee inspection service: "Approx ₹1,500 · price
 * after inspection" with an approx price, else "Price on inspection".
 * Never "₹0": nothing about the job is free, only the booking.
 */
export function noFeeInspectionText(
  service: InspectionFields,
  format: (amount: number) => string = formatINR
): string {
  return inspectionApproxLine(service, format) ?? t('Price on inspection')
}

/**
 * The line under a price when there is room for it: the approx line of an
 * inspection service that has a fee (a no-fee one already says it in its
 * price slot). Null otherwise.
 */
export function inspectionNoteUnderPrice(
  service: InspectionFields,
  format: (amount: number) => string = formatINR
): string | null {
  if (service.pricingType !== 'on_inspection' || isNoFeeInspection(service)) return null
  return inspectionApproxLine(service, format)
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
  service: PricedFields,
  vehicleType?: VehicleType
): number | null {
  if (service.pricingType === 'per_vehicle' && vehicleType) {
    return tierPriceFor(service, vehicleType)
  }
  return service.price
}

/**
 * A short human label for a service's price, e.g. "₹300", "₹200 inspection",
 * "Price on inspection" (no fee),
 * or — for a per-vehicle service with no vehicle in context — the span its
 * tiers cover ("₹300–₹500").
 *
 * Deliberately compact: this sits in the price slot of list cards and the
 * sticky booking bar, where a full "Hatch ₹300 · Sedan ₹400 · SUV ₹500" would
 * crowd out the service name on a phone. The itemised breakdown belongs in the
 * details popup, which has the room for it.
 */
export function formatServicePrice(
  service: PricedFields,
  vehicleType?: VehicleType
): string {
  switch (service.pricingType) {
    case 'on_inspection':
      if (isNoFeeInspection(service)) return noFeeInspectionText(service)
      return t('₹{price} inspection', { price: service.price })
    case 'per_vehicle': {
      if (vehicleType) {
        const amount = tierPriceFor(service, vehicleType)
        return amount == null ? t('Price on request') : `₹${amount}`
      }
      const tiers = [
        service.priceHatchback,
        service.priceSedan,
        service.priceSuv,
      ].filter((t): t is number => t != null)

      if (tiers.length === 0) return t('from ₹{price}', { price: service.price })

      const low = Math.min(...tiers)
      const high = Math.max(...tiers)
      return low === high ? `₹${low}` : `₹${low}–₹${high}`
    }
    case 'flat':
    default:
      return `₹${service.price}`
  }
}
