/**
 * The Detlio Service History certificate (0053): a printable record of every
 * job done on a customer's car through Detlio, and the public page that
 * proves it is genuine. Pure, with the clock and keys passed in;
 * modules/certificates reads the rows, links and photos.
 *
 * - **What counts** is exactly the car's history (lib/car-history.ts): one
 *   entry per reschedule chain (its latest row), only chains whose latest row
 *   is `completed`. Cancelled chains (no-shows of either side included) and
 *   jobs to come are left out, and so is any chain the team marked Test.
 *   **A Detlio Guarantee free redo (0051, `bookings.guarantee_redo`) is left
 *   out too**: it re-does a job the certificate already lists (that job
 *   stays, with its own date and photos), so listing it would count one
 *   service twice, and a "Free redo" line on a page shared with buyers would
 *   speak about the garage's work rather than the car's history. Its photos
 *   are never served on the public page either. (The customer's own car
 *   history still shows it.)
 * - **No personal data on the public page**: the car's make, model, colour,
 *   body type and a masked registration; per job its IST date, the garage's
 *   name and its tier medal (Bronze, Silver or Gold, 0063) as customers see
 *   it today, the services' names and whether the garage took before and
 *   after photos. Never the owner's name, phone or address, the full plate,
 *   amounts, booking ids or a stored photo URL. `toPublicCertificate` is an
 *   allow-list, field by field, like vendors.public.ts.
 * - **Tokens**: 32 URL-safe characters (192 bits), the link's id signed with
 *   a key derived from JWT_SECRET (`linkToken`), so the owner's page can show
 *   the same link and QR code again without the token being stored: the
 *   table holds only `tokenHash`, and the public page looks a link up by it.
 *   If the secret changes, links already shared keep working (the hash still
 *   matches) and the owner is asked to make a new one to see it again.
 * - **Photos on the public page** go through the API (`photoPath`): an
 *   HMAC-signed path, valid PHOTO_URL_TTL_SECONDS, made per view, naming the
 *   photo and bound to the live link. The stored photo URLs are never sent:
 *   job photos sit at public, unguessable addresses in the photo bucket, so
 *   handing one out would outlive "Stop sharing".
 */
import type { Tier } from './tiers.js'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { latestOfChains } from './car-history.js'
import { istDateKey } from './ist.js'

// ─── Words and numbers the app shares (packages/core twin) ───────────────────

/** A share token: 32 URL-safe base64 characters. */
export const CERTIFICATE_TOKEN_LENGTH = 32
export const CERTIFICATE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/

/** How long a shared link may last, in days; null (the default) never expires. */
export const SHARE_EXPIRY_DAYS = [7, 30, 90] as const
export type ShareExpiryDays = (typeof SHARE_EXPIRY_DAYS)[number]

/** How long a public photo address works. Made afresh on every view. */
export const PHOTO_URL_TTL_SECONDS = 10 * 60

/** The number printed on the certificate: DSH-XXXX-XXXX. */
export const CERTIFICATE_NUMBER_PATTERN = /^DSH-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/

// ─── Rows, as the repository reads them ──────────────────────────────────────

/** One booking row of the car. */
export interface CertificateRow {
  id: string
  /** `coalesce(original_booking_id, id)`. */
  chainId: string
  rescheduleCount: number
  createdAt: Date
  status: string
  scheduledAt: Date
  completedAt: Date | null
  /** The team's Test mark (`marked_test_at`), copied along the chain. */
  markedTest: boolean
  /** A Detlio Guarantee free redo (0051): never listed. */
  guaranteeRedo?: boolean
  vendorId: string
  vendorName: string
  /** The garage is in the Bin (or deleted forever): its marks are not shown. */
  vendorInBin: boolean
  /** The services' names as booked, in order. */
  services: string[]
}

/** One of the garage's job photos (never the customer's own). */
export interface CertificatePhoto {
  id: string
  bookingId: string
  stage: 'before' | 'after'
  angle: string | null
  createdAt: Date
  /** The stored public URL: for the owner's own page only. */
  url: string
}

export interface CertificateCar {
  id: string
  make: string
  model: string
  color: string | null
  licensePlate: string | null
  vehicleType: string
}

// ─── What the pages receive ──────────────────────────────────────────────────

export interface CertificateJob {
  /** The IST date the job was done, "YYYY-MM-DD". */
  date: string
  /** The garage's medal as customers see it today (lib/tiers.ts shownTier), or null. */
  garage: { name: string; tier: Tier | null }
  services: string[]
  /** Whether the garage took before / after photos of the job. */
  photos: { before: boolean; after: boolean }
  /** One before and one after photo, only when photos are included. */
  photoPair: { before: string; after: string } | null
}

export interface CertificateView {
  certificateNumber: string
  /** The IST date the record was read, "YYYY-MM-DD". */
  asOf: string
  car: {
    make: string
    model: string
    color: string | null
    bodyType: string
    /** Masked ("TN09 ** ** 1234"), or null when there is none to show. */
    registration: string | null
  }
  /** Newest first. */
  jobs: CertificateJob[]
  totals: {
    jobs: number
    /** "YYYY-MM-DD" of the first and the latest job, null with none. */
    firstServiceOn: string | null
    lastServiceOn: string | null
  }
}

/** The public page's payload: the view, and whether photos were shared. */
export interface PublicCertificate extends CertificateView {
  includesPhotos: boolean
}

// ─── Registration masking ────────────────────────────────────────────────────

const MASK = '** **'

/**
 * The registration as the certificate prints it: the state and RTO, and the
 * last four digits, with the series letters covered — "TN 09 AB 1234" →
 * "TN09 ** ** 1234". Enough for a buyer to match the car in front of them;
 * not the full plate, which is what a registration lookup needs. The mask
 * is always the same width, so it does not say how long the series is.
 *
 * - Standard plates (state, 1–2 digit RTO, 0–3 series letters, 1–4 digits):
 *   the RTO is written with two digits and the number with four.
 * - Bharat series ("22 BH 1234 AA"): the year, BH and the digits; the
 *   letters covered.
 * - Anything else (a temporary or mistyped plate): the last two characters
 *   only. Fewer than four letters and digits, or none: null (not shown).
 */
export function maskRegistration(plate: string | null | undefined): string | null {
  if (!plate) return null
  const clean = plate.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (clean.length < 4) return null

  const standard = /^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/.exec(clean)
  if (standard) {
    const [, state, rto, , number] = standard
    return `${state}${rto.padStart(2, '0')} ${MASK} ${number.padStart(4, '0')}`
  }
  const bharat = /^(\d{2})BH(\d{4})([A-Z]{1,2})$/.exec(clean)
  if (bharat) return `${bharat[1]} BH ${bharat[2]} **`
  return `${MASK} ** ${clean.slice(-2)}`
}

// ─── The certificate number ──────────────────────────────────────────────────

/** Gift codes' alphabet: no 0/O, 1/I/L look-alikes. */
const NUMBER_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/**
 * The certificate's number, the same for a car every time it is printed or
 * shared (so a printed copy and the page it links to agree, and a new link
 * does not make a new certificate): a one-way digest of the car's id, which
 * says nothing about the car or its owner.
 */
export function certificateNumber(vehicleId: string): string {
  const digest = createHash('sha256').update(`detlio-certificate:${vehicleId}`).digest()
  let out = ''
  for (let i = 0; i < 8; i += 1) out += NUMBER_ALPHABET[digest[i] % NUMBER_ALPHABET.length]
  return `DSH-${out.slice(0, 4)}-${out.slice(4)}`
}

// ─── Tokens ──────────────────────────────────────────────────────────────────

/** The key for tokens and photo signatures, from the server's secret. */
export function deriveCertificateKey(secret: string): Buffer {
  return createHmac('sha256', secret).update('certificate-link-v1').digest()
}

/** A link's token: its id signed with the key. Never stored. */
export function linkToken(key: Buffer, linkId: string): string {
  return createHmac('sha256', key).update(`link:${linkId}`).digest('base64url').slice(0, CERTIFICATE_TOKEN_LENGTH)
}

/** What `token_hash` holds for a token: a hex SHA-256 (64 characters). */
export function tokenHash(token: string): string {
  return createHash('sha256').update(`detlio-certificate-link:${token}`).digest('hex')
}

export function isTokenShaped(token: unknown): token is string {
  return typeof token === 'string' && CERTIFICATE_TOKEN_PATTERN.test(token)
}

// ─── A link's standing ───────────────────────────────────────────────────────

export interface LinkTimes {
  revokedAt: Date | null
  expiresAt: Date | null
}

export type LinkStanding = 'active' | 'expired' | 'revoked'

export function linkStanding(link: LinkTimes, now: Date): LinkStanding {
  if (link.revokedAt) return 'revoked'
  if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) return 'expired'
  return 'active'
}

/** When a link made now with this choice stops working (null: never). */
export function expiresAtFor(days: ShareExpiryDays | null, now: Date): Date | null {
  return days === null ? null : new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
}

// ─── Photo addresses for the public page ─────────────────────────────────────

function photoSignature(key: Buffer, photoId: string, linkId: string, expiresAtSec: number): string {
  return createHmac('sha256', key).update(`photo:${photoId}:${linkId}:${expiresAtSec}`).digest('base64url').slice(0, 32)
}

/**
 * The API path (under /api/v1) of one photo for one view of a shared
 * certificate. It names the photo and when it stops working; the link it was
 * made for is in the signature only, so the path says nothing about it, and
 * a new link (or none) makes every earlier path fail.
 */
export function photoPath(key: Buffer, photoId: string, linkId: string, now: Date): string {
  const expiresAtSec = Math.floor(now.getTime() / 1000) + PHOTO_URL_TTL_SECONDS
  return `/certificates/photos/${photoId}?e=${expiresAtSec}&s=${photoSignature(key, photoId, linkId, expiresAtSec)}`
}

/** Whether a photo path's signature is good for this link, and not yet run out. */
export function photoSignatureValid(
  key: Buffer,
  input: { photoId: string; linkId: string; expiresAtSec: number; signature: string },
  now: Date
): boolean {
  const nowSec = Math.floor(now.getTime() / 1000)
  if (!Number.isInteger(input.expiresAtSec)) return false
  if (input.expiresAtSec <= nowSec || input.expiresAtSec > nowSec + PHOTO_URL_TTL_SECONDS + 60) return false
  const expected = Buffer.from(photoSignature(key, input.photoId, input.linkId, input.expiresAtSec))
  const given = Buffer.from(input.signature)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

// ─── What counts ─────────────────────────────────────────────────────────────

function doneAt(row: Pick<CertificateRow, 'completedAt' | 'scheduledAt'>): Date {
  return row.completedAt ?? row.scheduledAt
}

/**
 * The jobs the certificate lists: each chain once (its latest row), only
 * completed ones, no chain the team marked Test and no free redo (0051),
 * newest first.
 */
export function eligibleJobs<Row extends CertificateRow>(rows: Row[]): Row[] {
  const testChains = new Set(rows.filter((row) => row.markedTest).map((row) => row.chainId))
  return latestOfChains(rows)
    .filter((row) => row.status === 'completed' && !testChains.has(row.chainId) && !row.guaranteeRedo)
    .sort((a, b) => doneAt(b).getTime() - doneAt(a).getTime() || b.id.localeCompare(a.id))
}

/** The angles a pair is matched on, the most telling first. */
const PAIR_ANGLES = ['front', 'back', 'left', 'right', 'interior']

/**
 * One before and one after photo of a job, of the same angle when the
 * garage took one from both sides (front first), else its first of each.
 * Null unless it has both.
 */
export function photoPairOf<Photo extends Pick<CertificatePhoto, 'stage' | 'angle' | 'createdAt' | 'id'>>(
  photos: Photo[]
): { before: Photo; after: Photo } | null {
  const oldestFirst = [...photos].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
  const before = oldestFirst.filter((photo) => photo.stage === 'before')
  const after = oldestFirst.filter((photo) => photo.stage === 'after')
  if (before.length === 0 || after.length === 0) return null
  for (const angle of PAIR_ANGLES) {
    const b = before.find((photo) => photo.angle === angle)
    const a = after.find((photo) => photo.angle === angle)
    if (b && a) return { before: b, after: a }
  }
  return { before: before[0], after: after[0] }
}

// ─── Building it ─────────────────────────────────────────────────────────────

export interface CertificateInput {
  car: CertificateCar
  rows: CertificateRow[]
  /** The garage's photos of the listed jobs (any order). */
  photos: CertificatePhoto[]
  /** Each garage's medal today, as customers see it (absent: none). */
  tiers: ReadonlyMap<string, Tier | null>
  now: Date
}

/**
 * The certificate. `photoUrl` says where each photo of a pair is shown from
 * (the owner's short-lived links, or the public page's signed paths); null leaves
 * every pair out, which is what a link without photos gets.
 */
export function buildCertificate(
  input: CertificateInput,
  photoUrl: ((photo: CertificatePhoto) => string) | null
): CertificateView {
  const jobs = eligibleJobs(input.rows)
  const photosOf = new Map<string, CertificatePhoto[]>()
  for (const photo of input.photos) {
    const list = photosOf.get(photo.bookingId) ?? []
    list.push(photo)
    photosOf.set(photo.bookingId, list)
  }

  const listed: CertificateJob[] = jobs.map((row) => {
    const photos = photosOf.get(row.id) ?? []
    const pair = photoUrl ? photoPairOf(photos) : null
    const marks = !row.vendorInBin
    return {
      date: istDateKey(doneAt(row)),
      garage: {
        name: row.vendorName,
        tier: marks ? (input.tiers.get(row.vendorId) ?? null) : null,
      },
      services: row.services,
      photos: {
        before: photos.some((photo) => photo.stage === 'before'),
        after: photos.some((photo) => photo.stage === 'after'),
      },
      photoPair: pair && photoUrl ? { before: photoUrl(pair.before), after: photoUrl(pair.after) } : null,
    }
  })

  return {
    certificateNumber: certificateNumber(input.car.id),
    asOf: istDateKey(input.now),
    car: {
      make: input.car.make,
      model: input.car.model,
      color: input.car.color,
      bodyType: input.car.vehicleType,
      registration: maskRegistration(input.car.licensePlate),
    },
    jobs: listed,
    totals: {
      jobs: listed.length,
      firstServiceOn: listed.length ? listed[listed.length - 1].date : null,
      lastServiceOn: listed.length ? listed[0].date : null,
    },
  }
}

/**
 * The public page's payload, copied field by field from the view so nothing
 * added to it later reaches a stranger by accident. Add a field here only on
 * purpose, and to the "no personal data" test.
 */
export function toPublicCertificate(view: CertificateView, includesPhotos: boolean): PublicCertificate {
  return {
    certificateNumber: view.certificateNumber,
    asOf: view.asOf,
    car: {
      make: view.car.make,
      model: view.car.model,
      color: view.car.color,
      bodyType: view.car.bodyType,
      registration: view.car.registration,
    },
    jobs: view.jobs.map((job) => ({
      date: job.date,
      garage: {
        name: job.garage.name,
        tier: job.garage.tier,
      },
      services: [...job.services],
      photos: { before: job.photos.before, after: job.photos.after },
      photoPair: includesPhotos && job.photoPair ? { before: job.photoPair.before, after: job.photoPair.after } : null,
    })),
    totals: {
      jobs: view.totals.jobs,
      firstServiceOn: view.totals.firstServiceOn,
      lastServiceOn: view.totals.lastServiceOn,
    },
    includesPhotos,
  }
}
