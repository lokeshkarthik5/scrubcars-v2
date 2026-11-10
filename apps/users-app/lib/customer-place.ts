import { useCustomerCity } from '@repo/core/api/hooks/use-cities';
import { outsideCityLine, outsideCityTag, type PlacedGarage } from '@repo/core/customer-city';

import { useLocationStore } from './location';

/**
 * The customer's city and place (0070): the phone's stored location through
 * the cities rule (packages/core/src/customer-city.ts), the twin of the web's
 * useCustomerPlace (@repo/core/hooks/use-customer-place) over this app's own
 * store.
 */
export function useCustomerPlace() {
  const location = useLocationStore((s) => s.location);
  return { ...useCustomerCity(location), location };
}

/** A garage card's town chip ("Vellore · 125 km"), or null for a garage in the customer's city. */
export function useGarageTownTag(garage: PlacedGarage): string | null {
  const { place } = useCustomerPlace();
  return outsideCityTag(garage, place);
}

/** The garage page's and checkout's line for a garage in another town, or null in the customer's city. */
export function useGarageTownLine(garage: PlacedGarage | null | undefined): string | null {
  const { place } = useCustomerPlace();
  return garage ? outsideCityLine(garage, place) : null;
}
