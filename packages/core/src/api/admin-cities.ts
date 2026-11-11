import { apiClient } from '@repo/core/api/client'
import { signedBody } from './admin-signer'

/**
 * Cities (0069): the cities Detlio serves, each with its "Customers see
 * garages here" switch, and the Other towns row for garages in no city.
 * Super-admin only. New with this release, so the panel reads a 404 as
 * "not there yet" (an API from before cities).
 */

export interface PlaceCounts {
  /** Garages customers can find now (Live, the city's switch included). */
  garagesLive: number
  /** Every garage not in the Bin. */
  garagesTotal: number
  /** The live garages switching this place off would hide (all but "Show anyway"). */
  garagesHiddenWhenOff: number
}

export interface AdminCity extends PlaceCounts {
  id: string
  name: string
  lat: number
  lng: number
  reachKm: number
  customersSee: boolean
  /**
   * "Growing here" (0070): customers in this city see the free-wash card and
   * that more garages are joining. Absent from an API before it, and the
   * page then leaves the switch out.
   */
  growing?: boolean
  createdAt: string
  updatedAt: string
}

export interface CitiesOverview {
  cities: AdminCity[]
  otherTowns: PlaceCounts & { label: string; visible: boolean }
}

export interface CityInput {
  name: string
  lat: number
  lng: number
  reachKm: number
}

/** GET /admin/cities */
export async function getCities() {
  return apiClient<CitiesOverview>('/admin/cities')
}

/** POST /admin/cities — on for customers unless `customersSee: false`. */
export async function createCity(input: CityInput & { customersSee?: boolean }) {
  return apiClient<CitiesOverview>('/admin/cities', { method: 'POST', body: signedBody(input) })
}

/** PATCH /admin/cities/:id — only what is sent changes. */
export async function updateCity(
  id: string,
  input: Partial<CityInput> & { customersSee?: boolean; growing?: boolean }
) {
  return apiClient<CitiesOverview>(`/admin/cities/${id}`, { method: 'PATCH', body: signedBody(input) })
}

/** DELETE /admin/cities/:id — its garages move to the city that now holds them, else Other towns. */
export async function deleteCity(id: string) {
  return apiClient<CitiesOverview>(`/admin/cities/${id}`, { method: 'DELETE' })
}

/** PATCH /admin/cities/other-towns — garages in no city shown to customers, or not. */
export async function setOtherTowns(visible: boolean) {
  return apiClient<CitiesOverview>('/admin/cities/other-towns', {
    method: 'PATCH',
    body: signedBody({ visible }),
  })
}

export interface BranchInput {
  businessName: string
  city: string
  address: string
  pincode: string
  lat?: number
  lng?: number
  serviceIds: string[]
  copyHours: boolean
  copyPhotos: boolean
  /**
   * The branch owner's phone: the source owner's own number is the same
   * login (both garages in the garage app); another is that person's login.
   */
  ownerPhone: string
  /** Needed when no account has that number yet. */
  ownerName?: string
}

/**
 * POST /admin/vendors/:id/branch — "Add a branch…": a new Pending garage for
 * the same business, not shown to customers, with what admin chose to copy.
 */
export async function createBranch(vendorId: string, input: BranchInput) {
  return apiClient<{ id: string }>(`/admin/vendors/${vendorId}/branch`, {
    method: 'POST',
    body: signedBody(input),
  })
}
