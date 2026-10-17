import { apiClient } from './client'
import { mapVendorListItem } from './mappers'
import type { ApiVendorListItem } from './types'
import type { Vendor } from '@repo/core/types'

/**
 * The customer's saved garages: the heart on the garage list and the garage
 * page, and Profile's Saved garages. The server only ever reads and writes
 * the signed-in customer's own.
 */

export interface SavedGarages {
  /** As the garage list's cards, newest saved first; a paused one says so. */
  vendors: Vendor[]
  /** How many may be saved. */
  max: number
}

interface ApiFavourites {
  items: ApiVendorListItem[]
  pausedVendorIds: string[]
  max: number
}

/** GET /users/me/favourites */
export async function getSavedGarages(): Promise<SavedGarages> {
  const data = await apiClient<ApiFavourites>('/users/me/favourites')
  const paused = new Set(data.pausedVendorIds)
  return {
    vendors: data.items.map((item) => ({ ...mapVendorListItem(item), bookingsPaused: paused.has(item.id) })),
    max: data.max,
  }
}

/** PUT /users/me/favourites/:vendorId — idempotent. */
export async function saveGarage(vendorId: string): Promise<void> {
  await apiClient(`/users/me/favourites/${vendorId}`, { method: 'PUT' })
}

/** DELETE /users/me/favourites/:vendorId — idempotent. */
export async function unsaveGarage(vendorId: string): Promise<void> {
  await apiClient(`/users/me/favourites/${vendorId}`, { method: 'DELETE' })
}
