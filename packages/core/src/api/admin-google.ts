import type { GoogleRating } from '../ratings'
import { signedBody } from './admin-signer'
import { apiClient } from './client'

/**
 * Google rating for new garages (21 Nov 2026): a garage's Google listing in
 * admin, kept on its Coverage lead (apps/server/src/lib/garage-google.ts).
 * `AdminVendor.google` on the Garages list; null: no Google listing.
 */
export interface AdminGoogleListing {
  leadId: string
  placeId: string
  /** As Google lists it, while Detlio may hold it (30 days); null once cleared. */
  name: string | null
  address: string | null
  /** Google's rating customers may be shown now; null when none (cleared, 30 days old, or no rating on Google). */
  google: GoogleRating | null
  /** When Detlio last read it from Google, and when it reads it again; null once cleared. */
  readAt: string | null
  nextReadBy: string | null
  /** Counted Detlio reviews. */
  detlioReviews: number
  /** Customers see Google's rating now (fewer than 5 counted Detlio reviews). */
  shown: boolean
  leadSource: string
  /** The last Link to Google listing (from the audit log); null when it came with its Coverage lead. */
  linkedBy: string | null
  linkedAt: string | null
}

/** A Google result in the "Link to Google listing" dialog, nearest the garage's pin first. */
export interface AdminGooglePlace {
  placeId: string
  name: string
  address: string | null
  rating: number | null
  reviewCount: number | null
  distanceM: number
  /** This garage's listing now. */
  current: boolean
  /** Another garage is linked to it: it cannot be linked here. */
  linkedGarage: { id: string; name: string } | null
  /** A lead not yet a garage holds it: linking makes that lead this garage's. */
  onLead: { id: string; name: string } | null
}

/**
 * POST /admin/vendors/:id/google/search — Google's places near the garage's
 * pin for these words (the garage's name when left out). Nothing is stored.
 * 400 GARAGE_NO_PIN, 503 PLACES_UNCONFIGURED, 502 GOOGLE_UNAVAILABLE, 429.
 */
export async function searchGarageGoogle(vendorId: string, text?: string) {
  return apiClient<{ places: AdminGooglePlace[] }>(`/admin/vendors/${vendorId}/google/search`, {
    method: 'POST',
    body: JSON.stringify(text ? { text } : {}),
  })
}

/**
 * POST /admin/vendors/:id/google/link — signed, audited. 409
 * GOOGLE_LISTING_TAKEN, GOOGLE_LISTING_ON_LEAD, GOOGLE_LISTING_CHANGED; 404
 * GOOGLE_PLACE_GONE.
 */
export async function linkGarageGoogle(vendorId: string, placeId: string) {
  return apiClient<{ listing: AdminGoogleListing }>(`/admin/vendors/${vendorId}/google/link`, {
    method: 'POST',
    body: signedBody({ placeId }),
  })
}

/** POST /admin/vendors/:id/google/unlink — signed, audited. 404 GOOGLE_LISTING_NOT_FOUND. */
export async function unlinkGarageGoogle(vendorId: string) {
  return apiClient<{ unlinked: true }>(`/admin/vendors/${vendorId}/google/unlink`, {
    method: 'POST',
    body: signedBody({}),
  })
}
