import { ApiError, apiClient } from '@repo/core/api/client';

/**
 * A garage's add-ons, read here until PR #107 puts this in core. Its contract:
 * GET /vendors/:vendorId/add-ons, public, the live ones only, money as decimal strings.
 */
export interface ApiAddOn {
  id: string;
  name: string;
  pricingType: 'flat' | 'per_vehicle';
  price: string;
  priceHatchback: string | null;
  priceSedan: string | null;
  priceSuv: string | null;
  extraMins: number;
  isActive: boolean;
}

export interface AddOn {
  id: string;
  name: string;
  pricingType: 'flat' | 'per_vehicle';
  price: number;
  priceHatchback: number | null;
  priceSedan: number | null;
  priceSuv: number | null;
  extraMins: number;
  isActive: boolean;
}

export function mapAddOn(row: ApiAddOn): AddOn {
  const tier = (value: string | null) => (value === null ? null : Number(value));
  return {
    id: row.id,
    name: row.name,
    pricingType: row.pricingType,
    price: Number(row.price),
    priceHatchback: tier(row.priceHatchback),
    priceSedan: tier(row.priceSedan),
    priceSuv: tier(row.priceSuv),
    extraMins: row.extraMins,
    isActive: row.isActive,
  };
}

/** A server without the route yet (404) has no add-ons: the page shows no section. */
export async function getVendorAddOns(
  vendorId: string,
  read: typeof apiClient = apiClient
): Promise<AddOn[]> {
  try {
    const rows = await read<ApiAddOn[]>(`/vendors/${vendorId}/add-ons`, { auth: false });
    return rows.map(mapAddOn);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return [];
    throw error;
  }
}

/** "+10 min", or "No extra time". */
export const addOnTimeLabel = (extraMins: number) => (extraMins > 0 ? `+${extraMins} min` : 'No extra time');
export const addOnCountLabel = (count: number) => (count === 1 ? '1 add-on' : `${count} add-ons`);
