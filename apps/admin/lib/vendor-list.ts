/**
 * The garage list's rules: which garages each chip shows and how many, what
 * the chips mean, how a card says the way a garage books, and how its
 * checklist reads. Pure, so they are tested here (vendor-list.test.ts) rather
 * than read off a page.
 *
 * The checklist itself — what is blocking, what is to fix — and whether a
 * garage is Live are decided on the server (lib/vendor-readiness.ts and the
 * customer lists' own rule in vendors.predicates.ts). This only presents them.
 */
import type { AdminVendor, ReadinessItem } from '@repo/core/api/admin'
import { DEFAULT_DOORSTEP_RADIUS_KM } from './garage-edit'

// ─── Chips ───────────────────────────────────────────────────────────────────

/**
 * The chips, in order. All is every garage not in the Bin, so the stages add
 * up to it; the Bin is apart, last, and in no other chip or count.
 */
export const SHOW_FILTERS = ['all', 'live', 'active', 'pending', 'suspended', 'archived', 'bin'] as const
export type ShowFilter = (typeof SHOW_FILTERS)[number]

export const SHOW_LABELS: Record<ShowFilter, string> = {
  all: 'All',
  live: 'Live',
  active: 'Active',
  pending: 'Pending',
  suspended: 'Suspended',
  archived: 'Archived',
  bin: 'Bin',
}

/**
 * "Documents to review": garages (not in the Bin) with documents waiting for
 * Detlio to check (0043). A chip of its own after the stages, shown while
 * any wait or while chosen; it cuts across the stages, so it is not one of
 * SHOW_FILTERS and its garages are counted there too.
 */
export const REVIEW_FILTER = 'documents' as const
export const REVIEW_LABEL = 'Documents to review'

/**
 * Detlio Certified (0048): two more chips that cut across the stages, after
 * the documents one. "Certified": customers see the seal now. "Eligible,
 * not yet certified": met every standard at its last evaluation (nightly,
 * or the last Certify), so a quality check is the next thing to do. Neither
 * holds a garage in the Bin.
 */
export const CERTIFIED_FILTER = 'certified' as const
export const CERTIFIED_LABEL = 'Certified'
export const ELIGIBLE_FILTER = 'eligible' as const
export const ELIGIBLE_LABEL = 'Eligible, not yet certified'

export type ListFilter = ShowFilter | typeof REVIEW_FILTER | typeof CERTIFIED_FILTER | typeof ELIGIBLE_FILTER

/** What the list opens on: the garages customers can find. */
export const DEFAULT_SHOW: ShowFilter = 'live'

/** The chip a `?show=` asks for, or Live. An allow-list, like `?tab=`. */
export function parseShow(value: string | null | undefined): ListFilter {
  if (value === REVIEW_FILTER) return REVIEW_FILTER
  if (value === CERTIFIED_FILTER) return CERTIFIED_FILTER
  if (value === ELIGIBLE_FILTER) return ELIGIBLE_FILTER
  return value && (SHOW_FILTERS as readonly string[]).includes(value)
    ? (value as ShowFilter)
    : DEFAULT_SHOW
}

/** The list with a chip chosen: `/vendors` for the default, so Back is tidy. */
export function listHref(show: ListFilter): string {
  return show === DEFAULT_SHOW ? '/vendors' : `/vendors?show=${show}`
}

type ListedFields = Pick<AdminVendor, 'live' | 'status' | 'isVerified' | 'bookingsPausedAt' | 'deletedAt'> &
  Partial<Pick<AdminVendor, 'documents' | 'certification'>>

/** Detlio Certified now, and not in the Bin. */
export function isCertifiedGarage(v: ListedFields): boolean {
  return !isInBin(v) && v.certification?.certified === true
}

/** Met every standard at its last evaluation, not certified, not in the Bin. */
export function isEligibleNotCertified(v: ListedFields): boolean {
  return !isInBin(v) && v.certification?.certified !== true && v.certification?.eligible === true
}

/** How many garages the two certification chips hold. */
export function certificationCounts(vendors: ListedFields[]): { certified: number; eligible: number } {
  return {
    certified: vendors.filter(isCertifiedGarage).length,
    eligible: vendors.filter(isEligibleNotCertified).length,
  }
}

/** Has documents waiting for Detlio, and is not in the Bin. */
export function hasDocumentsToReview(v: ListedFields): boolean {
  return !isInBin(v) && (v.documents?.toReview ?? 0) > 0
}

/** How many garages the "Documents to review" chip holds. */
export function documentsToReviewCount(vendors: ListedFields[]): number {
  return vendors.filter(hasDocumentsToReview).length
}

/** Moved to the Bin by admin, and not restored. */
export function isInBin(v: Pick<AdminVendor, 'deletedAt'>): boolean {
  return v.deletedAt != null
}

/**
 * Whether customers can find the garage: the server's `live`. The fallback
 * is only for a server older than that field, during a deploy, so the list
 * does not open on an empty Live; it is the same rule (Active, verified, not
 * paused, not in the Bin), and the server's flag wins whenever it is there.
 */
export function isLive(v: ListedFields): boolean {
  return v.live ?? (v.status === 'active' && v.isVerified && !v.bookingsPausedAt && !isInBin(v))
}

/** A garage in the Bin is under the Bin chip and no other. */
export function matchesShow(v: ListedFields, show: ListFilter): boolean {
  if (show === REVIEW_FILTER) return hasDocumentsToReview(v)
  if (show === CERTIFIED_FILTER) return isCertifiedGarage(v)
  if (show === ELIGIBLE_FILTER) return isEligibleNotCertified(v)
  if (show === 'bin') return isInBin(v)
  if (isInBin(v)) return false
  if (show === 'all') return true
  if (show === 'live') return isLive(v)
  return v.status === show
}

/** Each chip's count, over the full list the page already has. */
export function showCounts(vendors: ListedFields[]): Record<ShowFilter, number> {
  const counts = Object.fromEntries(SHOW_FILTERS.map((s) => [s, 0])) as Record<ShowFilter, number>
  for (const v of vendors) {
    for (const show of SHOW_FILTERS) if (matchesShow(v, show)) counts[show] += 1
  }
  return counts
}

/**
 * The two short lines under the chips: what the chosen one means. Live and
 * Active are told apart wherever either could be meant, since to the owner
 * they sound like the same thing.
 */
export function showHints(show: ListFilter): Array<{ term: string; meaning: string }> {
  switch (show) {
    case REVIEW_FILTER:
      return [{ term: REVIEW_LABEL, meaning: 'uploaded by the garage, waiting for Detlio to check them' }]
    case CERTIFIED_FILTER:
      return [{ term: 'Detlio Certified', meaning: 'customers see the seal; checked every night' }]
    case ELIGIBLE_FILTER:
      return [
        { term: 'Eligible', meaning: 'met every standard last night; record a quality check, then Certify' },
      ]
    case 'pending':
      return [{ term: 'Pending', meaning: 'added, not shown to customers yet' }]
    case 'suspended':
      return [{ term: 'Suspended', meaning: 'stopped by Detlio, not shown to customers' }]
    case 'archived':
      return [{ term: 'Archived', meaning: 'put away, not shown to customers; its bookings are kept' }]
    case 'bin':
      return [{ term: 'Bin', meaning: 'off the app. Restore it, or delete it forever.' }]
    default:
      return [
        { term: 'Live', meaning: 'customers can find it' },
        { term: 'Active', meaning: 'approved by Detlio, even if paused' },
      ]
  }
}

// ─── The card ────────────────────────────────────────────────────────────────

/**
 * The word beside the name for a garage customers can't find, and why: its
 * stage, or, for an Active one, that it is paused or not verified. Null when
 * it is live, where the card says its bookings instead.
 */
export function stateWord(v: ListedFields): string | null {
  if (isLive(v)) return null
  if (v.status !== 'active') {
    return v.status.charAt(0).toUpperCase() + v.status.slice(1)
  }
  const paused = Boolean(v.bookingsPausedAt)
  if (paused && !v.isVerified) return 'Paused · not verified'
  return paused ? 'Paused' : 'Not verified'
}

/** "12 bookings will be deleted with it", or null when none would be. */
export function binDeleteLine(count: number): string | null {
  if (count <= 0) return null
  return `${count} booking${count === 1 ? '' : 's'} will be deleted with it`
}

/** "Has 4 bookings", "Has 1 booking", "No bookings yet". */
export function bookingsLine(count: number): string {
  if (count <= 0) return 'No bookings yet'
  return `Has ${count} booking${count === 1 ? '' : 's'}`
}

/** One piece of the card's meta line; `quiet` is set in the muted grey. */
export type MetaPart = { text?: string; quiet?: string }

/**
 * How the garage books, after its city: "At the garage · Doorstep 8 km",
 * "Doorstep only · 7 km". An empty radius is the 10 km default, said quietly
 * as such; a garage that drew its own area is covered by that area instead.
 * Nothing when no booking type is on: the checklist says so, in amber.
 */
export function bookingParts(
  v: Pick<AdminVendor, 'dropinEnabled' | 'doorstepEnabled' | 'doorstepRadiusKm' | 'hasDoorstepArea'> &
    Partial<Pick<AdminVendor, 'pickupEnabled'>>
): MetaPart[] {
  // Pickup & drop, when on, comes last: "At the garage · Pickup & drop".
  const parts = bookingModeParts(v)
  return v.pickupEnabled ? [...parts, { text: 'Pickup & drop' }] : parts
}

function bookingModeParts(
  v: Pick<AdminVendor, 'dropinEnabled' | 'doorstepEnabled' | 'doorstepRadiusKm' | 'hasDoorstepArea'>
): MetaPart[] {
  const reach: MetaPart = v.hasDoorstepArea
    ? { quiet: 'drawn area' }
    : v.doorstepRadiusKm == null
      ? { quiet: `${DEFAULT_DOORSTEP_RADIUS_KM} km default` }
      : { text: `${v.doorstepRadiusKm} km` }

  if (v.dropinEnabled && v.doorstepEnabled) {
    // "Doorstep 8 km" reads as one piece; the quiet ones follow the word.
    return [
      { text: 'At the garage' },
      reach.text ? { text: `Doorstep ${reach.text}` } : { text: 'Doorstep', quiet: reach.quiet },
    ]
  }
  if (v.doorstepEnabled) return [{ text: 'Doorstep only' }, reach]
  if (v.dropinEnabled) return [{ text: 'At the garage' }]
  return []
}

// ─── The checklist ───────────────────────────────────────────────────────────

export const READINESS_GROUPS: Array<{
  severity: ReadinessItem['severity']
  title: string
  note: string
}> = [
  { severity: 'blocking', title: 'Blocking', note: 'Needed before it can be booked' },
  { severity: 'fix', title: 'Fix', note: 'Works, but fix soon' },
  { severity: 'optional', title: 'Optional', note: 'Nice to have' },
]

/** The checklist's groups that have something in them, in order. */
export function readinessGroups(items: ReadinessItem[]) {
  return READINESS_GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => item.severity === group.severity),
  })).filter((group) => group.items.length > 0)
}

export interface ReadinessSummary {
  /** Something blocking or to fix: the line is amber. Optional never is. */
  needsFixing: boolean
  /** "Ready", "1 blocking · 2 to fix", "1 to fix: map pin". */
  main: string
  /** Trails in grey: "2 optional: logo, photos", or "3 optional". */
  optional: string | null
}

const uniqueShorts = (items: ReadinessItem[]) => [...new Set(items.map((i) => i.short))].join(', ')

/**
 * The card's one readiness line. Only blocking and fix items count as
 * needing fixing, so a garage missing only a logo still reads Ready. With
 * nothing blocking, the items to fix are named, as there are few; with
 * something blocking, the counts are the message.
 */
export function readinessSummary(items: ReadinessItem[]): ReadinessSummary {
  const blocking = items.filter((i) => i.severity === 'blocking')
  const fix = items.filter((i) => i.severity === 'fix')
  const optional = items.filter((i) => i.severity === 'optional')

  if (blocking.length === 0 && fix.length === 0) {
    return {
      needsFixing: false,
      main: 'Ready',
      optional: optional.length > 0 ? `${optional.length} optional: ${uniqueShorts(optional)}` : null,
    }
  }

  const counts = [
    blocking.length > 0 ? `${blocking.length} blocking` : null,
    fix.length > 0 ? `${fix.length} to fix` : null,
  ].filter(Boolean)
  return {
    needsFixing: true,
    main: blocking.length > 0 ? counts.join(' · ') : `${counts[0]}: ${uniqueShorts(fix)}`,
    optional: optional.length > 0 ? `${optional.length} optional` : null,
  }
}

/**
 * Where a checklist row goes: the garage's edit page on the tab the item is
 * fixed on, with the list as it was (its chip) for the back arrow.
 */
export function editHref(vendorId: string, back: string, tab?: ReadinessItem['tab'] | 'certification'): string {
  const query = new URLSearchParams()
  if (tab) query.set('tab', tab)
  query.set('back', back)
  return `/vendors/${vendorId}/edit?${query.toString()}`
}
