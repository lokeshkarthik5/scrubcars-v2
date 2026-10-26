import { randomUUID } from 'node:crypto'
import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import {
  buildCertificate,
  deriveCertificateKey,
  eligibleJobs,
  expiresAtFor,
  isTokenShaped,
  linkStanding,
  linkToken,
  photoPath,
  photoSignatureValid,
  toPublicCertificate,
  tokenHash,
  type CertificateCar,
  type CertificatePhoto,
  type CertificateView,
  type PublicCertificate,
} from '../../lib/service-history-certificate.js'
import { jobPhotoLink, readJobPhoto } from '../../lib/job-photo-storage.js'
import { certificationService } from '../certification/certification.service.js'
import { documentsVerifiedIds } from '../vendors/vendors.service.js'
import { certificatesRepository, type CertificateLinkRow } from './certificates.repository.js'
import type { ShareInput, UpdateShareInput } from './certificates.validation.js'

const log = logger.child({ module: 'certificates' })

/**
 * Where a shared photo's bytes come from: the private bucket, or the public
 * one for an older row (lib/job-photo-storage.ts). A seam for the route tests.
 */
export const photoStore = { read: readJobPhoto }

/** Signs tokens and photo paths. Read once: JWT_SECRET does not change while running. */
const key = deriveCertificateKey(env.jwtSecret)

/** The customer's link, as their certificate page shows it. */
export interface CertificateShareView {
  /** `expired`: made with an expiry that has passed; it no longer opens. */
  state: 'active' | 'expired'
  /**
   * The token for the link and QR code. Null only when it can no longer be
   * shown (the server's secret changed since it was made): the link still
   * works for whoever has it, and making a new one ends it.
   */
  token: string | null
  includePhotos: boolean
  createdAt: string
  expiresAt: string | null
  lastViewedAt: string | null
  viewCount: number
}

export interface OwnCertificateResponse {
  certificate: CertificateView
  /** The car's link, if it has one not stopped; null when not shared. */
  share: CertificateShareView | null
}

function carNotFound(): AppError {
  return new AppError(404, 'Vehicle not found', 'VEHICLE_NOT_FOUND')
}

/**
 * Every way a public lookup can fail says the same thing, so the page
 * cannot tell an unknown token from one that was revoked, ran out, or whose
 * car or account is gone.
 */
function notShared(): AppError {
  return new AppError(404, 'This certificate is not shared.', 'CERTIFICATE_NOT_FOUND')
}

function toShareView(link: CertificateLinkRow, now: Date): CertificateShareView {
  const token = linkToken(key, link.id)
  return {
    state: linkStanding(link, now) === 'expired' ? 'expired' : 'active',
    token: tokenHash(token) === link.tokenHash ? token : null,
    includePhotos: link.includePhotos,
    createdAt: link.createdAt.toISOString(),
    expiresAt: link.expiresAt?.toISOString() ?? null,
    lastViewedAt: link.lastViewedAt?.toISOString() ?? null,
    viewCount: link.viewCount,
  }
}

/**
 * The certificate's facts for one car: its rows, the garage's photos of the
 * jobs it lists, and which of those garages hold each mark today.
 */
async function readCertificate(userId: string, car: CertificateCar, now: Date) {
  const rows = await certificatesRepository.listCertificateRows(userId, car.id)
  const jobs = eligibleJobs(rows)
  const vendorIds = [...new Set(jobs.map((job) => job.vendorId))]
  const photos = await certificatesRepository.listGaragePhotos(jobs.map((job) => job.id))
  const [certified, documentsVerified] = await Promise.all([
    certificationService.certifiedIds(vendorIds),
    documentsVerifiedIds(vendorIds),
  ])
  return { car, rows, photos, certified, documentsVerified, now }
}

export const certificatesService = {
  /**
   * The owner's certificate for one of their current cars, with its link.
   * Anyone else's car, or one they removed, is a 404. Photo pairs carry
   * short-lived links (jobPhotoLink), as the owner's own bookings do; the
   * page shows them only when "Include photos" is ticked.
   */
  async getOwn(userId: string, vehicleId: string, now = new Date()): Promise<OwnCertificateResponse> {
    const car = await certificatesRepository.findOwnCar(userId, vehicleId)
    if (!car) throw carNotFound()
    const certificate = buildCertificate(
      await readCertificate(userId, car, now),
      (photo: CertificatePhoto) => jobPhotoLink(photo.url, now.getTime())
    )
    const link = await certificatesRepository.findLiveLink(vehicleId)
    return { certificate, share: link && link.userId === userId ? toShareView(link, now) : null }
  },

  /**
   * Share: a new link (and token) for the car. Any link it had stops working
   * in the same write, so "Share again" and "New link" are this too.
   */
  async share(userId: string, vehicleId: string, input: ShareInput, now = new Date()): Promise<CertificateShareView> {
    const car = await certificatesRepository.findOwnCar(userId, vehicleId)
    if (!car) throw carNotFound()
    const id = randomUUID()
    const link = await certificatesRepository.replaceLink({
      id,
      userId,
      vehicleId,
      tokenHash: tokenHash(linkToken(key, id)),
      includePhotos: input.includePhotos,
      expiresAt: expiresAtFor(input.expiresInDays, now),
      now,
    })
    log.info({ userId, vehicleId, linkId: link.id, includePhotos: link.includePhotos }, 'certificate:shared')
    return toShareView(link, now)
  },

  /** Photos on or off for the link already shared; the token stays. 404 when not shared. */
  async updateShare(userId: string, vehicleId: string, input: UpdateShareInput, now = new Date()) {
    const car = await certificatesRepository.findOwnCar(userId, vehicleId)
    if (!car) throw carNotFound()
    const link = await certificatesRepository.setIncludePhotos(userId, vehicleId, input.includePhotos)
    if (!link) throw new AppError(404, 'This certificate is not shared.', 'CERTIFICATE_NOT_SHARED')
    log.info({ userId, vehicleId, linkId: link.id, includePhotos: link.includePhotos }, 'certificate:photos_changed')
    return toShareView(link, now)
  },

  /** "Stop sharing": the link stops working at once. Saying it twice is not an error. */
  async stopSharing(userId: string, vehicleId: string, now = new Date()) {
    const car = await certificatesRepository.findOwnCar(userId, vehicleId)
    if (!car) throw carNotFound()
    const ended = await certificatesRepository.revoke(userId, vehicleId, now)
    if (ended > 0) log.info({ userId, vehicleId }, 'certificate:stopped')
    return { stopped: true }
  },

  /**
   * The public page (/verify/<token>, signed out): the certificate without
   * personal data (toPublicCertificate), and photo pairs through short-lived
   * signed paths only when the owner included them. An unknown, revoked or
   * expired token, or one whose car was removed or whose account is not
   * active, is the same 404. The token is never logged.
   */
  async verify(token: string, now = new Date()): Promise<PublicCertificate> {
    if (!isTokenShaped(token)) throw notShared()
    const found = await certificatesRepository.findByTokenHash(tokenHash(token))
    if (!found || linkStanding(found.link, now) !== 'active') throw notShared()
    const { link, car } = found

    const facts = await readCertificate(link.userId, car, now)
    const view = buildCertificate(
      facts,
      link.includePhotos ? (photo: CertificatePhoto) => photoPath(key, photo.id, link.id, now) : null
    )
    await certificatesRepository.recordView(link.id, now)
    return toPublicCertificate(view, link.includePhotos)
  },

  /**
   * One photo of a shared certificate, for the public page: only through a
   * path this API signed for the car's live link, while that link still
   * includes photos and has not run out, only the garage's photo of a
   * completed job that is not Test-marked. Everything else is a 404.
   */
  async sharedPhoto(photoId: string, expiresAtSec: number, signature: string, now = new Date()) {
    const photo = await certificatesRepository.findSharedPhoto(photoId)
    const link = photo?.link
    if (
      !photo ||
      !link ||
      !link.includePhotos ||
      linkStanding(link, now) !== 'active' ||
      photo.uploadedByRole !== 'garage' ||
      photo.bookingStatus !== 'completed' ||
      photo.bookingMarkedTest ||
      photo.bookingGuaranteeRedo ||
      !photoSignatureValid(key, { photoId, linkId: link.id, expiresAtSec, signature }, now)
    ) {
      throw new AppError(404, 'Not found', 'NOT_FOUND')
    }
    const object = await photoStore.read({ storageKey: photo.storageKey, url: photo.url })
    if (!object) throw new AppError(404, 'Not found', 'NOT_FOUND')
    return { body: object.body, contentType: contentTypeOf(photo.storageKey, object.contentType) }
  },

  /** Admin's Statistics card: counts only, never a car or a customer. */
  async adminTotals(now = new Date()) {
    return certificatesRepository.shareTotals(now)
  },
}

/** Served as an image type only: the key's extension decides, never what the uploader claimed. */
function contentTypeOf(key: string, stored: string | null): string {
  if (key.endsWith('.png')) return 'image/png'
  if (key.endsWith('.webp')) return 'image/webp'
  if (key.endsWith('.jpg') || key.endsWith('.jpeg')) return 'image/jpeg'
  return stored === 'image/png' || stored === 'image/webp' ? stored : 'image/jpeg'
}
