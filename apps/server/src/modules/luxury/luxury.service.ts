import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import {
  DECISION_AUDIT,
  DECISION_STATUS,
  afterSend,
  applyRefusal,
  decisionRefusal,
  isOwnLuxuryPhotoKey,
  LUXURY_PHOTO_FOLDER,
  LUXURY_RULES,
  onApplicationsList,
  orderBrands,
  waitUntil,
  type ApplyRefusal,
  type DecisionRefusal,
  type LuxuryDecision,
  type LuxuryStatus,
  type SilverHoldings,
} from '../../lib/luxury.js'
import { garageLuxuryDecision } from '../../lib/push-messages.js'
import { createPresignedUpload, keyFromPublicUrl } from '../../lib/storage.js'
import type { Tier } from '../../lib/tiers.js'
import type { LuxuryApplicationRecord } from '../../db/schema.js'
import { pushService } from '../push/push.service.js'
import { tiersService } from '../tiers/tiers.service.js'
import { luxuryRepository, type LuxuryVendorRow } from './luxury.repository.js'
import type { EditBrandsInput, LuxuryPhotoUploadInput, SendApplicationInput } from './luxury.validation.js'

const log = logger.child({ module: 'luxury' })

type Actor = { sub: string; name: string }

/** An application as the garage and admin read it. */
export interface LuxuryApplicationView {
  status: LuxuryStatus
  brands: string[]
  photos: Array<{ url: string; caption: string | null }>
  coveredBay: boolean
  products: string | null
  staff: string | null
  /** The team's words on Ask for more, Decline or Remove; null otherwise. */
  teamNote: string | null
  /** Who answered last (the signed-in admin's name) and when; null before any answer. */
  decidedBy: string | null
  decidedAt: string | null
  /** Its place in the queue (oldest first). */
  sentAt: string
  /** 1 on the first send ("first time"). */
  timesSent: number
  updatedAt: string
}

/** The badge as the garage and admin read it. */
export interface LuxuryBadgeView {
  approvedAt: string
  approvedBy: string | null
  brands: string[]
  /** Customers see it now: approved, and Silver or Gold held. */
  shown: boolean
}

export interface GarageLuxuryResponse {
  /** The tier the garage holds (whatever customers are shown). */
  tier: Tier | null
  silverOrGold: boolean
  application: LuxuryApplicationView | null
  badge: LuxuryBadgeView | null
  /** Declined: the IST date it may apply again, while the wait runs; null otherwise. */
  reapplyOn: string | null
  limits: typeof LUXURY_RULES
}

export interface AdminLuxuryResponse {
  garage: { id: string; businessName: string; inBin: boolean }
  tier: Tier | null
  silverOrGold: boolean
  application: LuxuryApplicationView | null
  badge: LuxuryBadgeView | null
  /** On the Garages list's "Luxury applications": waiting, and Silver or Gold held. */
  onApplicationsList: boolean
}

/** One garage's luxury line on the admin Garages list (GET /admin/vendors rows' `luxury`). */
export interface AdminLuxurySummary {
  status: LuxuryStatus | null
  sentAt: string | null
  timesSent: number
  /** Waiting, with Silver or Gold held: counted in "to review". */
  onApplicationsList: boolean
  approvedAt: string | null
  /** Customers see the badge now. */
  shown: boolean
}

function toApplicationView(row: LuxuryApplicationRecord): LuxuryApplicationView {
  return {
    status: row.status,
    brands: row.brands,
    photos: row.photos,
    coveredBay: row.coveredBay,
    products: row.products,
    staff: row.staff,
    teamNote: row.teamNote,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    sentAt: row.sentAt.toISOString(),
    timesSent: row.timesSent,
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toBadgeView(vendor: LuxuryVendorRow, held: SilverHoldings): LuxuryBadgeView | null {
  if (!vendor.luxuryApprovedAt) return null
  return {
    approvedAt: vendor.luxuryApprovedAt.toISOString(),
    approvedBy: vendor.luxuryApprovedBy,
    brands: vendor.luxuryBrands ?? [],
    shown: held.gold || held.silver,
  }
}

const holdingsOf = (tier: Tier | null): SilverHoldings => ({ gold: tier === 'gold', silver: tier === 'silver' })

async function heldTierOf(vendorId: string): Promise<Tier | null> {
  return (await tiersService.heldTiers([vendorId])).get(vendorId) ?? null
}

function garageNotFound() {
  return new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
}

const APPLY_REFUSALS: Record<ApplyRefusal, () => AppError> = {
  LUXURY_NEEDS_SILVER: () =>
    new AppError(409, 'The Luxury specialist badge is for Silver and Gold garages. Reach Silver, then apply.', 'LUXURY_NEEDS_SILVER'),
  LUXURY_ALREADY_APPROVED: () =>
    new AppError(409, 'You are already a Luxury car specialist.', 'LUXURY_ALREADY_APPROVED'),
  LUXURY_WAIT: () =>
    new AppError(409, 'You can apply again 30 days after a decline.', 'LUXURY_WAIT'),
}

const DECISION_REFUSALS: Record<DecisionRefusal, () => AppError> = {
  LUXURY_NO_APPLICATION: () => new AppError(404, 'This garage has not applied for the badge.', 'LUXURY_NO_APPLICATION'),
  LUXURY_NOT_PENDING: () =>
    new AppError(409, 'This application has already been answered. Reload to see where it stands.', 'LUXURY_NOT_PENDING'),
  LUXURY_NOT_APPROVED: () => new AppError(409, 'This garage does not have the badge.', 'LUXURY_NOT_APPROVED'),
  LUXURY_NOTE_REQUIRED: () => new AppError(400, 'Write the garage a short note.', 'LUXURY_NOTE_REQUIRED'),
  LUXURY_NEEDS_SILVER: () =>
    new AppError(409, 'This garage is below Silver now, so it cannot be approved until it is Silver again.', 'LUXURY_NEEDS_SILVER'),
  VENDOR_IN_BIN: () => new AppError(409, 'This garage is in the Bin. Restore it first.', 'VENDOR_IN_BIN'),
}

export const luxuryService = {
  // ─── The garage's own ──────────────────────────────────────────────────────

  async getForGarage(vendorId: string, now = new Date()): Promise<GarageLuxuryResponse> {
    // One after another, never Promise.all (one database connection).
    const vendor = await luxuryRepository.findVendor(vendorId)
    if (!vendor) throw garageNotFound()
    const app = await luxuryRepository.findApplication(vendorId)
    const tier = await heldTierOf(vendorId)
    const held = holdingsOf(tier)
    return {
      tier,
      silverOrGold: held.gold || held.silver,
      application: app ? toApplicationView(app) : null,
      badge: toBadgeView(vendor, held),
      reapplyOn: waitUntil(app, now),
      limits: LUXURY_RULES,
    }
  },

  /**
   * A presigned PUT for one luxury job photo, in the garage's own folder
   * (public bucket, like garage photos, under an unguessable uuid), with its
   * size signed in so nothing bigger than LUXURY_RULES.photoMaxBytes lands.
   */
  async createPhotoUploadUrl(vendorId: string, input: LuxuryPhotoUploadInput) {
    const { uploadUrl, publicUrl } = await createPresignedUpload(
      vendorId,
      input.contentType,
      LUXURY_PHOTO_FOLDER,
      input.sizeBytes
    )
    return { uploadUrl, publicUrl }
  },

  /**
   * Sends (or edits) the application. Each photo must be this garage's own
   * luxury upload. Refused below Silver (unless it is only an edit while
   * under review), when already approved, and during a decline's wait.
   */
  async send(vendorId: string, userId: string | null, input: SendApplicationInput, now = new Date()) {
    for (const photo of input.photos) {
      if (!isOwnLuxuryPhotoKey(keyFromPublicUrl(photo.url), vendorId)) {
        throw new AppError(400, 'Upload each photo from this screen.', 'INVALID_PHOTO_URL')
      }
    }
    if (new Set(input.photos.map((photo) => photo.url)).size !== input.photos.length) {
      throw new AppError(400, 'Each photo once.', 'INVALID_PHOTO_URL')
    }
    const vendor = await luxuryRepository.findVendor(vendorId)
    if (!vendor || vendor.deletedAt) throw garageNotFound()
    const tier = await heldTierOf(vendorId)

    const saved = await luxuryRepository.locked(vendorId, async (w) => {
      const app = await w.findApplication(vendorId)
      const refusal = applyRefusal({ held: holdingsOf(tier), app, now })
      if (refusal) throw APPLY_REFUSALS[refusal]()
      const next = afterSend(app, now)
      return w.saveApplication(vendorId, {
        status: next.status,
        brands: orderBrands(input.brands),
        photos: input.photos.map((photo) => ({ url: photo.url, caption: photo.caption })),
        coveredBay: input.coveredBay,
        products: input.products,
        staff: input.staff,
        sentAt: next.sentAt,
        timesSent: next.timesSent,
        sentBy: userId,
      })
    })
    log.info({ vendorId, timesSent: saved.timesSent, photos: saved.photos.length }, 'luxury:application_sent')
    return this.getForGarage(vendorId, now)
  },

  // ─── Admin ─────────────────────────────────────────────────────────────────

  async getForAdmin(vendorId: string): Promise<AdminLuxuryResponse> {
    const vendor = await luxuryRepository.findVendor(vendorId)
    if (!vendor) throw garageNotFound()
    const app = await luxuryRepository.findApplication(vendorId)
    const tier = await heldTierOf(vendorId)
    const held = holdingsOf(tier)
    return {
      garage: { id: vendor.id, businessName: vendor.businessName, inBin: vendor.deletedAt !== null },
      tier,
      silverOrGold: held.gold || held.silver,
      application: app ? toApplicationView(app) : null,
      badge: toBadgeView(vendor, held),
      onApplicationsList: onApplicationsList(app, held),
    }
  },

  /**
   * Approve, Ask for more, Decline (on a waiting application) or Remove badge
   * (on an approved one), with its admin_audit_log row, under the garage's
   * lock. The garage is told by a notification (never the note itself).
   */
  async decide(vendorId: string, decision: LuxuryDecision, note: string | null, actor: Actor) {
    const vendor = await luxuryRepository.findVendor(vendorId)
    if (!vendor) throw garageNotFound()
    const tier = await heldTierOf(vendorId)
    const held = holdingsOf(tier)

    await luxuryRepository.locked(vendorId, async (w) => {
      const app = await w.findApplication(vendorId)
      const refusal = decisionRefusal({ decision, app, note, held, inBin: vendor.deletedAt !== null })
      if (refusal) throw DECISION_REFUSALS[refusal]()
      const from = app!.status
      const teamNote = decision === 'approve' ? null : note!.trim()
      const updated = await w.decide(vendorId, { status: DECISION_STATUS[decision], teamNote, decidedBy: actor.name })
      if (decision === 'approve') {
        await w.setBadge(vendorId, { approvedBy: actor.name, brands: orderBrands(updated.brands) })
      } else if (decision === 'remove') {
        await w.setBadge(vendorId, null)
      }
      await w.audit(DECISION_AUDIT[decision], actor, vendor, {
        from,
        to: updated.status,
        note: teamNote,
        brands: updated.brands,
        tier,
        timesSent: updated.timesSent,
      })
    })
    log.info({ vendorId, decision }, 'luxury:decided')
    pushService.notifyGarage(vendorId, garageLuxuryDecision(decision))
    return this.getForAdmin(vendorId)
  },

  /** The brands customers see on an approved garage (the team can edit them). */
  async editBrands(vendorId: string, input: EditBrandsInput, actor: Actor) {
    const vendor = await luxuryRepository.findVendor(vendorId)
    if (!vendor) throw garageNotFound()
    if (vendor.deletedAt) throw DECISION_REFUSALS.VENDOR_IN_BIN()
    await luxuryRepository.locked(vendorId, async (w) => {
      const current = await w.findVendor(vendorId)
      if (!current?.luxuryApprovedAt) throw DECISION_REFUSALS.LUXURY_NOT_APPROVED()
      const to = orderBrands(input.brands)
      const from = current.luxuryBrands ?? []
      if (from.join('|') === to.join('|')) return
      await w.setBrands(vendorId, to)
      await w.audit('luxury_brands_edited', actor, vendor, { from, to })
    })
    return this.getForAdmin(vendorId)
  },

  /**
   * Each garage's luxury line for the admin Garages list, from one read of
   * the applications and the tiers the list already holds.
   */
  async summariesFor(
    vendors: Array<{ id: string; luxuryApprovedAt: Date | null }>,
    tiers: Map<string, Tier | null>
  ): Promise<Map<string, AdminLuxurySummary | null>> {
    const apps = new Map((await luxuryRepository.listApplicationStates()).map((row) => [row.vendorId, row]))
    return new Map(
      vendors.map((vendor) => {
        const app = apps.get(vendor.id)
        const held = holdingsOf(tiers.get(vendor.id) ?? null)
        if (!app && !vendor.luxuryApprovedAt) return [vendor.id, null]
        return [
          vendor.id,
          {
            status: app?.status ?? null,
            sentAt: app?.sentAt.toISOString() ?? null,
            timesSent: app?.timesSent ?? 0,
            onApplicationsList: onApplicationsList(app, held),
            approvedAt: vendor.luxuryApprovedAt?.toISOString() ?? null,
            shown: vendor.luxuryApprovedAt !== null && (held.gold || held.silver),
          },
        ]
      })
    )
  },
}
