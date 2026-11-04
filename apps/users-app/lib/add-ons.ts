import { ApiError } from '@repo/core/api/client';
import { getVendorAddOns as read, type AddOn } from '@repo/core/api/add-ons';

export type { AddOn } from '@repo/core/api/add-ons';
export { addOnCountLabel, addOnTimeLabel } from '@repo/core/add-ons';

/** A server without the route yet (404) has no add-ons: the page shows no section. */
export async function getVendorAddOns(vendorId: string, get: typeof read = read): Promise<AddOn[]> {
  try {
    return await get(vendorId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return [];
    throw error;
  }
}
