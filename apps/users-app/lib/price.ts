import { formatINR } from '@repo/core/format';
import { t } from '@repo/core/i18n/translate';
import {
  inspectionNoteUnderPrice,
  isNoFeeInspection,
  noFeeInspectionText,
  tierPriceFor,
} from '@repo/core/pricing';
import type { Service, VehicleType } from '@repo/core/types';

/** Rupees as the customer app shows them: paise only when there are any. */
export function money(amount: number | string): string {
  return formatINR(Number(amount), { paise: true });
}

/** A service's price, as apps/users/lib/price.ts: the customer's own car's, or a range. */
export function servicePriceText(
  service: Pick<Service, 'pricingType' | 'price' | 'priceHatchback' | 'priceSedan' | 'priceSuv'> &
    Partial<Pick<Service, 'approxPrice'>>,
  vehicleType?: VehicleType | null
): string {
  switch (service.pricingType) {
    case 'on_inspection':
      // No fee (0073): never "₹0", the approx price or "Price on inspection".
      if (isNoFeeInspection(service)) return noFeeInspectionText(service, money);
      return t('{amount} inspection', { amount: money(service.price) });
    case 'per_vehicle': {
      if (vehicleType) {
        const amount = tierPriceFor(service, vehicleType);
        return amount == null ? t('Price on request') : money(amount);
      }
      const tiers = [service.priceHatchback, service.priceSedan, service.priceSuv].filter(
        (t): t is number => t != null
      );
      if (tiers.length === 0) return t('from {amount}', { amount: money(service.price) });
      const low = Math.min(...tiers);
      const high = Math.max(...tiers);
      return low === high ? money(low) : `${money(low)}–${money(high)}`;
    }
    case 'flat':
    default:
      return money(service.price);
  }
}

/** So a screen can say "for your Creta" after a price: only a per-vehicle price set for it. */
export function pricedForCar(
  service: Pick<Service, 'pricingType' | 'priceHatchback' | 'priceSedan' | 'priceSuv'>,
  vehicleType?: VehicleType | null
): boolean {
  return service.pricingType === 'per_vehicle' && !!vehicleType && tierPriceFor(service, vehicleType) != null;
}

/** The line under an inspection fee, as apps/users/lib/price.ts serviceApproxNote (0073). */
export function serviceApproxNote(
  service: Pick<Service, 'pricingType' | 'price'> & Partial<Pick<Service, 'approxPrice'>>
): string | null {
  return inspectionNoteUnderPrice(service, money);
}

/** A booked line's price, as apps/users/lib/price.ts bookingLinePriceText (0073). */
export function bookingLinePriceText(item: { amount: number; pricingType?: Service['pricingType'] }): string {
  return item.pricingType === 'on_inspection' && !(item.amount > 0) ? t('Price on inspection') : money(item.amount);
}
