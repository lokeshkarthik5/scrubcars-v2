import { formatINR } from '@repo/core/format';
import { tierPriceFor } from '@repo/core/pricing';
import type { Service, VehicleType } from '@repo/core/types';

/** Rupees as the customer app shows them: paise only when there are any. */
export function money(amount: number | string): string {
  return formatINR(Number(amount), { paise: true });
}

/** A service's price, as apps/users/lib/price.ts: the customer's own car's, or a range. */
export function servicePriceText(
  service: Pick<Service, 'pricingType' | 'price' | 'priceHatchback' | 'priceSedan' | 'priceSuv'>,
  vehicleType?: VehicleType | null
): string {
  switch (service.pricingType) {
    case 'on_inspection':
      return `${money(service.price)} inspection`;
    case 'per_vehicle': {
      if (vehicleType) {
        const amount = tierPriceFor(service, vehicleType);
        return amount == null ? 'Price on request' : money(amount);
      }
      const tiers = [service.priceHatchback, service.priceSedan, service.priceSuv].filter(
        (t): t is number => t != null
      );
      if (tiers.length === 0) return `from ${money(service.price)}`;
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
