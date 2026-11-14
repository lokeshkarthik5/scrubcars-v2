import {
  inspectionNoteUnderPrice,
  isNoFeeInspection,
  noFeeInspectionText,
  tierPriceFor,
} from '@repo/core/pricing'
import type { Service, VehicleType } from '@repo/core/types'
import { bookedLinePrice } from '@repo/core/inspection-booking'
import { money } from '@/lib/money'
import { t } from '@repo/core/i18n/translate'

/**
 * A service's price as the customer app says it, with Indian commas
 * ("₹1,349", "₹349–₹599", "₹299 inspection"). The same cases as core's
 * formatServicePrice, written with the one money format (F7).
 *
 * With the customer's car type it is that car's price (F13): a range only
 * when there is no car to price for.
 */
export function servicePriceText(
  service: Pick<
    Service,
    'pricingType' | 'price' | 'priceHatchback' | 'priceSedan' | 'priceSuv'
  > &
    Partial<Pick<Service, 'approxPrice'>>,
  vehicleType?: VehicleType | null
): string {
  switch (service.pricingType) {
    case 'on_inspection':
      // No fee (0073): never "₹0", the approx price or "Price on inspection".
      if (isNoFeeInspection(service)) return noFeeInspectionText(service, money)
      return t('{price} inspection', { price: money(service.price) })
    case 'per_vehicle': {
      if (vehicleType) {
        const amount = tierPriceFor(service, vehicleType)
        return amount == null ? t('Price on request') : money(amount)
      }
      const tiers = [
        service.priceHatchback,
        service.priceSedan,
        service.priceSuv,
      ].filter((tier): tier is number => tier != null)
      if (tiers.length === 0)
        return t('from {price}', { price: money(service.price) })
      const low = Math.min(...tiers)
      const high = Math.max(...tiers)
      return low === high ? money(low) : `${money(low)}–${money(high)}`
    }
    case 'flat':
    default:
      return money(service.price)
  }
}

/**
 * Whether the price is the customer's own car's, so a screen can say
 * "for your Creta" after it: only a per-vehicle price that is set for it.
 */
export function pricedForCar(
  service: Pick<
    Service,
    'pricingType' | 'priceHatchback' | 'priceSedan' | 'priceSuv'
  >,
  vehicleType?: VehicleType | null
): boolean {
  return (
    service.pricingType === 'per_vehicle' &&
    !!vehicleType &&
    tierPriceFor(service, vehicleType) != null
  )
}

/**
 * The line under an inspection fee, where a screen has room for it: "Approx
 * ₹1,500 · price after inspection" (0073). Null for every other price, and
 * for a no-fee inspection, whose price slot already says it.
 */
export function serviceApproxNote(
  service: Pick<Service, 'pricingType' | 'price'> &
    Partial<Pick<Service, 'approxPrice'>>
): string | null {
  return inspectionNoteUnderPrice(service, money)
}

/**
 * A booked line's price: what it was sold at, or "Price on inspection" for a
 * no-fee inspection line (0073), whose ₹0 is not the price of the job.
 */
export function bookingLinePriceText(item: {
  amount: number
  pricingType?: Service['pricingType']
}): string {
  return bookedLinePrice(item, money)
}
