/**
 * Luxury car specialists (0083, owner-approved screens 21 Nov 2026,
 * reference/mockups/luxury-specialists). Pure, unit-tested (luxury.test.ts);
 * modules/luxury reads and writes, every decision is here:
 *
 *   - **Only the Detlio team grants the badge.** A garage applies from the
 *     garage app (Settings → Profile → Luxury car specialist) with the brands
 *     it handles, at least 3 photos of past luxury jobs, whether it has a
 *     covered or indoor bay, and (optionally) the products it uses and who
 *     does the work. The team approves, asks for more (with a note) or
 *     declines (with a note); an approved garage's badge can be removed (with
 *     a note). Every decision is in admin_audit_log.
 *   - **Silver or Gold only**: a garage must hold Silver or Gold (the tier it
 *     holds, whatever admin switched on for customers) to apply.
 *   - **Customers see the badge** while it is approved and the garage holds
 *     Silver or Gold (`luxuryShown`; SQL twin LUXURY_SPECIALIST in
 *     vendors.predicates.ts). Below Silver it is hidden, and back when Silver
 *     again, with nothing to redo.
 *   - **Same commission, same prices**: nothing here touches money; prices
 *     stay hatchback / sedan / SUV.
 *
 * The brands, the limits and the waiting days are twinned in
 * packages/core/src/luxury.ts (luxury.parity.test.ts).
 */
import { addDays, istDateKey } from './ist.js'

// ─── Brands ──────────────────────────────────────────────────────────────────

/** The makes whose owners see "Specialists for your <Make>" (core reads them; listed here for parity). */
export const LUXURY_MAKES = [
  'BMW',
  'Mercedes-Benz',
  'Audi',
  'Volvo',
  'Jaguar',
  'Land Rover',
  'Porsche',
  'Lexus',
  'Mini',
  'Maserati',
  'Bentley',
  'Rolls-Royce',
] as const

/** Every brand a garage can say it handles: these exact values, in the form's order. */
export const LUXURY_BRANDS = [...LUXURY_MAKES, 'Volkswagen', 'Skoda', 'Jeep', 'Toyota', 'MG', 'Kia', 'Other'] as const
export type LuxuryBrand = (typeof LUXURY_BRANDS)[number]

export function isLuxuryBrand(value: string): value is LuxuryBrand {
  return (LUXURY_BRANDS as readonly string[]).includes(value)
}

/** Each brand once, in the form's order, whatever order they were sent in. */
export function orderBrands(brands: readonly string[]): LuxuryBrand[] {
  const chosen = new Set(brands)
  return LUXURY_BRANDS.filter((brand) => chosen.has(brand))
}

// ─── Numbers ─────────────────────────────────────────────────────────────────

/** Every limit in one place. Change one here and in packages/core/src/luxury.ts together. */
export const LUXURY_RULES = {
  minPhotos: 3,
  maxPhotos: 8,
  captionMax: 40,
  productsMax: 300,
  staffMax: 200,
  noteMax: 300,
  /** After a decline, the garage may apply again this many IST days later. */
  reapplyDays: 30,
  /** One past-job photo, as uploaded (signed into its presigned PUT, so R2 refuses a bigger one). */
  photoMaxBytes: 8 * 1024 * 1024,
} as const

export const LUXURY_STATUSES = ['review', 'more', 'approved', 'declined', 'removed'] as const
export type LuxuryStatus = (typeof LUXURY_STATUSES)[number]

// ─── Who shows the badge ─────────────────────────────────────────────────────

/** A garage's tier holdings as far as the badge cares. */
export interface SilverHoldings {
  gold: boolean
  silver: boolean
}

export function holdsSilverOrGold(held: SilverHoldings | null | undefined): boolean {
  return held != null && (held.gold || held.silver)
}

/**
 * Customers see the badge while the team's approval stands and the garage
 * holds Silver or Gold. The SQL twin is LUXURY_SPECIALIST in
 * vendors.predicates.ts, pinned to this by vendors.predicates.test.ts.
 */
export function luxuryShown(row: { luxuryApprovedAt: Date | string | null }, held: SilverHoldings | null | undefined): boolean {
  return row.luxuryApprovedAt != null && holdsSilverOrGold(held)
}

// ─── Applying ────────────────────────────────────────────────────────────────

/** The application row as the rules read it. */
export interface ApplicationState {
  status: LuxuryStatus
  decidedAt: Date | null
}

/** The IST day a declined garage may apply again: `reapplyDays` after the decline. */
export function reapplyOn(decidedAt: Date): string {
  return addDays(istDateKey(decidedAt), LUXURY_RULES.reapplyDays)
}

/** While a decline's wait runs, the day it ends; null once it may apply (or when not declined). */
export function waitUntil(app: ApplicationState | null | undefined, now: Date): string | null {
  if (!app || app.status !== 'declined' || !app.decidedAt) return null
  const on = reapplyOn(app.decidedAt)
  return istDateKey(now) < on ? on : null
}

export type ApplyRefusal = 'LUXURY_NEEDS_SILVER' | 'LUXURY_ALREADY_APPROVED' | 'LUXURY_WAIT'

/**
 * Why the garage may not send (or edit) its application now, or null.
 * Below Silver: never (an application under review may still be edited, so
 * a garage that slipped can fix its photos meanwhile; it waits off the
 * team's list until Silver again). Approved: nothing to send. Declined:
 * not before the wait ends. Asked for more, removed, or a wait that ended:
 * sending again is the point.
 */
export function applyRefusal(input: {
  held: SilverHoldings | null | undefined
  app: ApplicationState | null | undefined
  now: Date
}): ApplyRefusal | null {
  const { app } = input
  if (app?.status === 'approved') return 'LUXURY_ALREADY_APPROVED'
  if (app?.status !== 'review' && !holdsSilverOrGold(input.held)) return 'LUXURY_NEEDS_SILVER'
  if (waitUntil(app, input.now)) return 'LUXURY_WAIT'
  return null
}

/**
 * What a send does to the row: an edit while under review keeps its place
 * in the queue (`sentAt` stays); answering "Asked for more" goes back to
 * review in the same place; a first send, or one after a decline or a
 * removal, joins the queue now and counts as another time sent.
 */
export function afterSend(app: (ApplicationState & { sentAt: Date; timesSent: number }) | null | undefined, now: Date) {
  if (!app) return { status: 'review' as const, sentAt: now, timesSent: 1, newRound: true }
  if (app.status === 'review' || app.status === 'more') {
    return { status: 'review' as const, sentAt: app.sentAt, timesSent: app.timesSent, newRound: false }
  }
  return { status: 'review' as const, sentAt: now, timesSent: app.timesSent + 1, newRound: true }
}

// ─── The team's decisions ────────────────────────────────────────────────────

export const LUXURY_DECISIONS = ['approve', 'more', 'decline', 'remove'] as const
export type LuxuryDecision = (typeof LUXURY_DECISIONS)[number]

/** What each decision leaves the application as. */
export const DECISION_STATUS: Record<LuxuryDecision, LuxuryStatus> = {
  approve: 'approved',
  more: 'more',
  decline: 'declined',
  remove: 'removed',
}

/** The audit action each decision writes. */
export const DECISION_AUDIT: Record<LuxuryDecision, string> = {
  approve: 'luxury_approved',
  more: 'luxury_asked_for_more',
  decline: 'luxury_declined',
  remove: 'luxury_badge_removed',
}

export type DecisionRefusal =
  | 'LUXURY_NO_APPLICATION'
  | 'LUXURY_NOT_PENDING'
  | 'LUXURY_NOT_APPROVED'
  | 'LUXURY_NOTE_REQUIRED'
  | 'LUXURY_NEEDS_SILVER'
  | 'VENDOR_IN_BIN'

/**
 * Why the team may not make this decision now, or null. Approve, Ask for
 * more and Decline answer an application that is waiting (under review or
 * asked for more); Approve also needs the garage to hold Silver or Gold
 * now. Remove takes an approved badge away. Every decision but Approve
 * needs a note: the garage reads it word for word.
 */
export function decisionRefusal(input: {
  decision: LuxuryDecision
  app: ApplicationState | null | undefined
  note: string | null | undefined
  held: SilverHoldings | null | undefined
  inBin: boolean
}): DecisionRefusal | null {
  const { decision, app } = input
  if (input.inBin) return 'VENDOR_IN_BIN'
  if (!app) return 'LUXURY_NO_APPLICATION'
  if (decision === 'remove') {
    if (app.status !== 'approved') return 'LUXURY_NOT_APPROVED'
  } else if (app.status !== 'review' && app.status !== 'more') {
    return 'LUXURY_NOT_PENDING'
  }
  if (decision !== 'approve' && !(input.note ?? '').trim()) return 'LUXURY_NOTE_REQUIRED'
  if (decision === 'approve' && !holdsSilverOrGold(input.held)) return 'LUXURY_NEEDS_SILVER'
  return null
}

/**
 * Whether an application sits on admin's "Luxury applications" list: waiting
 * (under review or asked for more) and its garage holds Silver or Gold. A
 * garage that drops below Silver while waiting leaves the list (and its
 * garage app says why) until Silver again.
 */
export function onApplicationsList(app: { status: LuxuryStatus } | null | undefined, held: SilverHoldings | null | undefined): boolean {
  return app != null && (app.status === 'review' || app.status === 'more') && holdsSilverOrGold(held)
}

// ─── Photos ──────────────────────────────────────────────────────────────────

/** The R2 folder a garage's luxury photos are uploaded to (storage.ts createPresignedUpload). */
export const LUXURY_PHOTO_FOLDER = 'luxury'

/** A photo's key is this garage's own luxury upload: `vendors/<id>/luxury/<uuid>.<ext>`. */
export function isOwnLuxuryPhotoKey(key: string | null, vendorId: string): boolean {
  if (!key) return false
  return new RegExp(
    `^vendors/${vendorId.replace(/[^0-9a-f-]/gi, '')}/${LUXURY_PHOTO_FOLDER}/[0-9a-f-]{36}\\.(jpg|png|webp)$`,
    'i'
  ).test(key)
}
