import { apiClient } from './client'

/**
 * The Detlio Service History certificate (API 0053,
 * apps/server/src/modules/certificates). Typed here by hand, field for field,
 * from the server's own interfaces (lib/service-history-certificate.ts,
 * certificates.service.ts), as car-history.ts is. The owner's calls read
 * only the signed-in customer's own cars; the public lookup is made by the
 * /verify page's server (apps/users/lib/certificates.ts), not from here.
 */

export interface CertificateGarage {
  name: string
  certified: boolean
  documentsVerified: boolean
}

export interface CertificateJob {
  /** The IST date the job was done, "YYYY-MM-DD". */
  date: string
  garage: CertificateGarage
  services: string[]
  /** Whether the garage took before / after photos. */
  photos: { before: boolean; after: boolean }
  /**
   * One before and one after photo. On the owner's page, the photos' own
   * addresses (shown only with "Include photos" ticked); on the public page,
   * API paths signed for that view, only when the owner included photos.
   */
  photoPair: { before: string; after: string } | null
}

export interface ServiceHistoryCertificate {
  /** "DSH-7K3M-Q9TX": the same for a car every time. */
  certificateNumber: string
  /** The IST date the record was read, "YYYY-MM-DD". */
  asOf: string
  car: {
    make: string
    model: string
    color: string | null
    /** `hatchback` / `sedan` / `suv`. */
    bodyType: string
    /** Masked, "TN09 ** ** 1234"; null when there is none to show. */
    registration: string | null
  }
  /** Completed jobs, newest first. */
  jobs: CertificateJob[]
  totals: { jobs: number; firstServiceOn: string | null; lastServiceOn: string | null }
}

/** What the public page receives. */
export interface PublicCertificate extends ServiceHistoryCertificate {
  includesPhotos: boolean
}

/** The car's share link, as its owner sees it. */
export interface CertificateShare {
  /** `expired`: it had an expiry that has passed; it no longer opens. */
  state: 'active' | 'expired'
  /** For the link and QR code; null if it can no longer be shown (make a new link). */
  token: string | null
  includePhotos: boolean
  createdAt: string
  expiresAt: string | null
  lastViewedAt: string | null
  viewCount: number
}

export interface OwnCertificate {
  certificate: ServiceHistoryCertificate
  share: CertificateShare | null
}

/** GET /users/me/vehicles/:vehicleId/certificate */
export function getOwnCertificate(vehicleId: string) {
  return apiClient<OwnCertificate>(`/users/me/vehicles/${vehicleId}/certificate`)
}

/** POST …/certificate/share: a new link; any link shared before stops working. */
export function shareCertificate(
  vehicleId: string,
  body: { includePhotos: boolean; expiresInDays: 7 | 30 | 90 | null }
) {
  return apiClient<CertificateShare>(`/users/me/vehicles/${vehicleId}/certificate/share`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** PATCH …/certificate/share: photos on or off; the link stays the same. */
export function updateCertificateShare(vehicleId: string, body: { includePhotos: boolean }) {
  return apiClient<CertificateShare>(`/users/me/vehicles/${vehicleId}/certificate/share`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

/** DELETE …/certificate/share: "Stop sharing". */
export function stopSharingCertificate(vehicleId: string) {
  return apiClient<{ stopped: true }>(`/users/me/vehicles/${vehicleId}/certificate/share`, { method: 'DELETE' })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

/** GET /admin/stats/certificates: counts only. */
export interface CertificateShareTotals {
  linksMade: number
  liveNow: number
  carsShared: number
  views: number
  liveWithPhotos: number
}

export function getCertificateShareTotals() {
  return apiClient<CertificateShareTotals>('/admin/stats/certificates')
}
