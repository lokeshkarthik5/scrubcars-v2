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
import { formatDay } from '@repo/core/format'
import {
  isMissingKey,
  MARK_CHASE_AFTER_DAYS,
  MISSING_LABELS,
  MISSING_TONES,
  type MissingKey,
} from '@repo/core/onboarding-marks'
import { DEFAULT_DOORSTEP_RADIUS_KM } from './garage-edit'
import { garageAreaName } from './localities'
import { parseColourFilter, type ColourFilter } from './garage-colours'

// ─── Chips ───────────────────────────────────────────────────────────────────

/**
 * The chips, in order (quick win 3): five that tell a garage's state apart
 * in words the owner uses, and All. All is every garage not in the Bin, and
 * Live, Not live yet, Paused and Archived split it with nothing left over;
 * the Bin is apart, last, and in no other chip or count.
 */
export const SHOW_FILTERS = [
  'all',
  'live',
  'notlive',
  'paused',
  'archived',
  'bin',
] as const
export type ShowFilter = (typeof SHOW_FILTERS)[number]

/**
 * The old stage chips. No longer drawn, but a link or bookmark that names
 * one still opens it, shown as one more chip while chosen.
 */
export const STAGE_FILTERS = ['active', 'pending', 'suspended'] as const
export type StageFilter = (typeof STAGE_FILTERS)[number]

export const SHOW_LABELS: Record<ShowFilter | StageFilter, string> = {
  all: 'All',
  live: 'Live',
  notlive: 'Not live yet',
  paused: 'Paused',
  archived: 'Archived',
  bin: 'Bin',
  active: 'Active',
  pending: 'Pending',
  suspended: 'Suspended',
}

/**
 * "Documents to review": garages (not in the Bin) with documents waiting for
 * Detlio to check (0043). It cuts across the states, so it is not one of
 * SHOW_FILTERS and its garages are counted there too. Under More filters.
 */
export const REVIEW_FILTER = 'documents' as const
export const REVIEW_LABEL = 'Documents to review'

/**
 * Detlio Certified (0048): two more filters that cut across the states,
 * under More filters. "Certified": customers see the seal now. "Eligible,
 * not yet certified": met every standard at its last evaluation (nightly,
 * or the last Certify), so a quality check is the next thing to do. Neither
 * holds a garage in the Bin.
 */
export const CERTIFIED_FILTER = 'certified' as const
export const CERTIFIED_LABEL = 'Certified'
export const ELIGIBLE_FILTER = 'eligible' as const
export const ELIGIBLE_LABEL = 'Eligible, not yet certified'

/** The filters behind "More filters", in order. */
export const MORE_FILTERS = [
  REVIEW_FILTER,
  CERTIFIED_FILTER,
  ELIGIBLE_FILTER,
] as const
export type MoreFilter = (typeof MORE_FILTERS)[number]

export const MORE_LABELS: Record<MoreFilter, string> = {
  documents: REVIEW_LABEL,
  certified: CERTIFIED_LABEL,
  eligible: ELIGIBLE_LABEL,
}

export type ListFilter = ShowFilter | StageFilter | MoreFilter

export function isMoreFilter(show: ListFilter): show is MoreFilter {
  return (MORE_FILTERS as readonly string[]).includes(show)
}

export function isStageFilter(show: ListFilter): show is StageFilter {
  return (STAGE_FILTERS as readonly string[]).includes(show)
}

/** What the list opens on: the garages customers can find. */
export const DEFAULT_SHOW: ShowFilter = 'live'

/** The chip a `?show=` asks for, or Live. An allow-list, like `?tab=`. */
export function parseShow(value: string | null | undefined): ListFilter {
  const known: readonly string[] = [
    ...SHOW_FILTERS,
    ...STAGE_FILTERS,
    ...MORE_FILTERS,
  ]
  return value && known.includes(value) ? (value as ListFilter) : DEFAULT_SHOW
}

/** The list with a chip chosen: `/vendors` for the default, so Back is tidy. */
export function listHref(show: ListFilter): string {
  return show === DEFAULT_SHOW ? '/vendors' : `/vendors?show=${show}`
}

type ListedFields = Pick<
  AdminVendor,
  'live' | 'status' | 'isVerified' | 'bookingsPausedAt' | 'deletedAt'
> &
  Partial<Pick<AdminVendor, 'documents' | 'certification'>>

/** Detlio Certified now, and not in the Bin. */
export function isCertifiedGarage(v: ListedFields): boolean {
  return !isInBin(v) && v.certification?.certified === true
}

/** Met every standard at its last evaluation, not certified, not in the Bin. */
export function isEligibleNotCertified(v: ListedFields): boolean {
  return (
    !isInBin(v) &&
    v.certification?.certified !== true &&
    v.certification?.eligible === true
  )
}

/** How many garages the two certification chips hold. */
export function certificationCounts(vendors: ListedFields[]): {
  certified: number
  eligible: number
} {
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

/** Stopped by Detlio (suspended), or taking no new bookings for now (paused). */
export function isPausedGarage(v: ListedFields): boolean {
  if (isInBin(v) || v.status === 'archived') return false
  return v.status === 'suspended' || Boolean(v.bookingsPausedAt)
}

/**
 * On its way in: added (Pending) or Active, not paused, and not yet
 * something customers can find (not verified, or something blocking).
 */
export function isNotLiveYet(v: ListedFields): boolean {
  if (isInBin(v) || v.status === 'archived' || isPausedGarage(v)) return false
  return !isLive(v)
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
  return (
    v.live ??
    (v.status === 'active' &&
      v.isVerified &&
      !v.bookingsPausedAt &&
      !isInBin(v))
  )
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
  if (show === 'notlive') return isNotLiveYet(v)
  if (show === 'paused') return isPausedGarage(v)
  return v.status === show
}

/**
 * "Garages matching …" from Find anything and the list's search box: the
 * name, the owner's name, a phone (digits only, so "98765 43210" finds
 * "+919876543210"; the garage's or the owner's), or the area. Empty
 * matches all.
 */
export function matchesSearch(
  v: Partial<
    Pick<
      AdminVendor,
      'businessName' | 'phone' | 'city' | 'address' | 'pincode' | 'owner'
    >
  >,
  q: string
): boolean {
  const text = q.trim().toLowerCase()
  if (!text) return true
  const digits = text.replace(/\D/g, '')
  const fields = [
    v.businessName,
    v.city,
    v.address,
    v.pincode,
    v.owner?.name,
  ].map((f) => (f ?? '').toLowerCase())
  if (fields.some((f) => f.includes(text))) return true
  if (digits.length < 4) return false
  return [v.phone, v.owner?.phone].some((phone) =>
    (phone ?? '').replace(/\D/g, '').includes(digits)
  )
}

/** Each chip's count, over the full list the page already has. */
export function showCounts(
  vendors: ListedFields[]
): Record<ShowFilter | StageFilter, number> {
  const all = [...SHOW_FILTERS, ...STAGE_FILTERS]
  const counts = Object.fromEntries(all.map((s) => [s, 0])) as Record<
    ShowFilter | StageFilter,
    number
  >
  for (const v of vendors) {
    for (const show of all) if (matchesShow(v, show)) counts[show] += 1
  }
  return counts
}

/**
 * The short line under the chips: what the chosen one means, in the owner's
 * words ("Live = customers can book it"). One line, not a two-line legend.
 */
export function showHints(
  show: ListFilter
): Array<{ term: string; meaning: string }> {
  switch (show) {
    case REVIEW_FILTER:
      return [
        {
          term: REVIEW_LABEL,
          meaning: 'uploaded by the garage, waiting for Detlio to check them',
        },
      ]
    case CERTIFIED_FILTER:
      return [
        {
          term: 'Detlio Certified',
          meaning: 'customers see the seal; checked every night',
        },
      ]
    case ELIGIBLE_FILTER:
      return [
        {
          term: 'Eligible',
          meaning:
            'met every standard last night; record a quality check, then Certify',
        },
      ]
    case 'notlive':
      return [
        {
          term: 'Not live yet',
          meaning:
            'added, not verified yet, or something blocks it. Its checklist says what.',
        },
      ]
    case 'paused':
      return [
        {
          term: 'Paused',
          meaning:
            'taking no new bookings for now, or stopped by Detlio (suspended)',
        },
      ]
    case 'pending':
      return [{ term: 'Pending', meaning: 'added, not shown to customers yet' }]
    case 'active':
      return [
        {
          term: 'Active',
          meaning: 'approved by Detlio, even if paused or not live',
        },
      ]
    case 'suspended':
      return [
        {
          term: 'Suspended',
          meaning: 'stopped by Detlio, not shown to customers',
        },
      ]
    case 'archived':
      return [
        {
          term: 'Archived',
          meaning: 'put away, not shown to customers; its bookings are kept',
        },
      ]
    case 'bin':
      return [
        {
          term: 'Bin',
          meaning: 'off the app. Restore it, or delete it forever.',
        },
      ]
    case 'all':
      return [{ term: 'All', meaning: 'every garage but the Bin' }]
    default:
      return [{ term: 'Live', meaning: 'customers can find it and book it' }]
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
  v: Pick<
    AdminVendor,
    'dropinEnabled' | 'doorstepEnabled' | 'doorstepRadiusKm' | 'hasDoorstepArea'
  > &
    Partial<Pick<AdminVendor, 'pickupEnabled'>>
): MetaPart[] {
  // Pickup & drop, when on, comes last: "At the garage · Pickup & drop".
  const parts = bookingModeParts(v)
  return v.pickupEnabled ? [...parts, { text: 'Pickup & drop' }] : parts
}

/**
 * How many Missing tags fit on one line of the Garages table (mockup 06):
 * as many as a budget of characters holds, red ones first as MissingTags
 * orders them, then "+N". At least one, so a row never shows only "+3".
 */
export function missingTagsThatFit(
  missing: readonly MissingKey[] | undefined,
  budget = 22
): number {
  if (!missing || missing.length === 0) return 0
  const ordered = [
    ...missing.filter((key) => MISSING_TONES[key] === 'red'),
    ...missing.filter((key) => MISSING_TONES[key] !== 'red'),
  ]
  let used = 0
  let fit = 0
  for (const key of ordered) {
    // A tag's padding and gap count as about two characters.
    const next = used + MISSING_LABELS[key].length + 2
    // "+N" needs room too, unless this is the last tag.
    const reserve = fit + 1 < ordered.length ? 3 : 0
    if (fit > 0 && next + reserve > budget) break
    used = next
    fit += 1
  }
  return fit
}

/**
 * How it books in a word or two, for the Garages table's narrow Modes
 * column (mockup 06): "Both", "At garage", "Doorstep", with "+ pickup" when
 * pickup & drop is on, and "None on" when nothing is. The radius is in the
 * side panel and the cell's title (`bookingParts`).
 */
export function modesShort(
  v: Pick<AdminVendor, 'dropinEnabled' | 'doorstepEnabled'> &
    Partial<Pick<AdminVendor, 'pickupEnabled'>>
): string {
  const base =
    v.dropinEnabled && v.doorstepEnabled
      ? 'Both'
      : v.doorstepEnabled
        ? 'Doorstep'
        : v.dropinEnabled
          ? 'At garage'
          : null
  if (v.pickupEnabled) return base ? `${base} + pickup` : 'Pickup only'
  return base ?? 'None on'
}

function bookingModeParts(
  v: Pick<
    AdminVendor,
    'dropinEnabled' | 'doorstepEnabled' | 'doorstepRadiusKm' | 'hasDoorstepArea'
  >
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
      reach.text
        ? { text: `Doorstep ${reach.text}` }
        : { text: 'Doorstep', quiet: reach.quiet },
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
  {
    severity: 'blocking',
    title: 'Blocking',
    note: 'Needed before it can be booked',
  },
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

const uniqueShorts = (items: ReadinessItem[]) =>
  [...new Set(items.map((i) => i.short))].join(', ')

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
      optional:
        optional.length > 0
          ? `${optional.length} optional: ${uniqueShorts(optional)}`
          : null,
    }
  }

  const counts = [
    blocking.length > 0 ? `${blocking.length} blocking` : null,
    fix.length > 0 ? `${fix.length} to fix` : null,
  ].filter(Boolean)
  return {
    needsFixing: true,
    main:
      blocking.length > 0
        ? counts.join(' · ')
        : `${counts[0]}: ${uniqueShorts(fix)}`,
    optional: optional.length > 0 ? `${optional.length} optional` : null,
  }
}

/**
 * Where a checklist row goes: the garage's edit page on the tab the item is
 * fixed on, with the list as it was (its chip) for the back arrow.
 */
export function editHref(
  vendorId: string,
  back: string,
  tab?: ReadinessItem['tab'] | 'certification'
): string {
  const query = new URLSearchParams()
  if (tab) query.set('tab', tab)
  query.set('back', back)
  return `/vendors/${vendorId}/edit?${query.toString()}`
}

// ─── The table's filters (0059) ──────────────────────────────────────────────

/** `?onboardedBy=-`: garages nobody is named against yet ("Not set"). */
export const ONBOARDED_NOT_SET = '-'
export const ONBOARDED_NOT_SET_LABEL = 'Not set'

/** The longest name the column holds (`vendors.onboarded_by_name`). */
const ONBOARDED_MAX = 100

/** A `?missing=` key, or null for anything else. An allow-list, like `?show=`. */
export function parseMissing(
  value: string | null | undefined
): MissingKey | null {
  return isMissingKey(value) ? value : null
}

/** A `?onboardedBy=` name (or Not set), trimmed; null when empty. */
export function parseOnboardedBy(
  value: string | null | undefined
): string | null {
  const name = value?.trim()
  return name ? name.slice(0, ONBOARDED_MAX) : null
}

/** `?team=with`: on an open collection list. `?team=mine`: on one of mine. */
export type TeamFilter = 'with' | 'mine'
export function parseTeam(value: string | null | undefined): TeamFilter | null {
  return value === 'with' || value === 'mine' ? value : null
}

/** Everything the Garages list keeps in its URL. */
export interface GarageListState {
  show: ListFilter
  q?: string
  missing?: MissingKey | null
  onboardedBy?: string | null
  team?: TeamFilter | null
  /** The colour chip (0061): a colour, or 'none'. */
  colour?: ColourFilter | null
}

/** The list's state from its URL. */
export function parseGarageList(params: {
  get(name: string): string | null
}): Required<GarageListState> {
  return {
    show: parseShow(params.get('show')),
    q: params.get('q') ?? '',
    missing: parseMissing(params.get('missing')),
    onboardedBy: parseOnboardedBy(params.get('onboardedBy')),
    team: parseTeam(params.get('team')),
    colour: parseColourFilter(params.get('colour')),
  }
}

/**
 * The list as it is now, as a link: `/vendors` for the default, so Back is
 * tidy; otherwise only what differs from it. What a row's links carry as
 * `back`, so the editor's back arrow returns to the same filters.
 */
export function garageListHref(state: GarageListState): string {
  const query = new URLSearchParams()
  if (state.show !== DEFAULT_SHOW) query.set('show', state.show)
  if (state.q?.trim()) query.set('q', state.q.trim())
  if (state.missing) query.set('missing', state.missing)
  if (state.onboardedBy) query.set('onboardedBy', state.onboardedBy)
  if (state.team) query.set('team', state.team)
  if (state.colour) query.set('colour', state.colour)
  const text = query.toString()
  return text ? `/vendors?${text}` : '/vendors'
}

/** Whether the garage still misses this (0059). False on an older API. */
export function isMissing(
  v: Pick<AdminVendor, 'missing'>,
  key: MissingKey | null
): boolean {
  if (!key) return true
  return v.missing?.includes(key) ?? false
}

/** Who brought the garage in, trimmed; null when not set. */
export function onboardedBy(
  v: Pick<AdminVendor, 'onboardedByName'>
): string | null {
  return v.onboardedByName?.trim() || null
}

/** The Onboarded by filter: a name exactly, or Not set. */
export function matchesOnboardedBy(
  v: Pick<AdminVendor, 'onboardedByName'>,
  filter: string | null
): boolean {
  if (!filter) return true
  const name = onboardedBy(v)
  if (filter === ONBOARDED_NOT_SET) return name === null
  return name === filter
}

export interface OnboardedByOption {
  value: string
  label: string
  count: number
}

/**
 * The Onboarded by filter's choices: each team login (A to Z), then any
 * other name typed on a garage ("Someone else…" is free text, and each
 * such name is its own choice), then Not set. Counted over the garages
 * given. A login nobody is named against still shows, with 0.
 */
export function onboardedByOptions(
  vendors: Array<Pick<AdminVendor, 'onboardedByName'>>,
  loginNames: readonly string[]
): OnboardedByOption[] {
  const counts = new Map<string, number>()
  let notSet = 0
  for (const v of vendors) {
    const name = onboardedBy(v)
    if (name === null) notSet += 1
    else counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const byName = (a: string, b: string) =>
    a.localeCompare(b, 'en-IN', { sensitivity: 'base' })
  const logins = [
    ...new Set(loginNames.map((n) => n.trim()).filter(Boolean)),
  ].sort(byName)
  const others = [...counts.keys()]
    .filter((n) => !logins.includes(n))
    .sort(byName)
  return [
    ...[...logins, ...others].map((name) => ({
      value: name,
      label: name,
      count: counts.get(name) ?? 0,
    })),
    { value: ONBOARDED_NOT_SET, label: ONBOARDED_NOT_SET_LABEL, count: notSet },
  ]
}

/**
 * The team chips: "With team" holds garages on an open collection list,
 * "Assigned to me" those on a list of mine (`mine`: the garage ids of my
 * open lists; null while unknown, which matches none).
 */
export function matchesTeam(
  v: Pick<AdminVendor, 'id' | 'openCollection'>,
  team: TeamFilter | null,
  mine: ReadonlySet<string> | null
): boolean {
  if (!team) return true
  if (team === 'with') return Boolean(v.openCollection)
  return mine?.has(v.id) ?? false
}

// ─── The table's cells ───────────────────────────────────────────────────────

/** "Velachery" for a pinned Chennai garage near a known area, else its city. */
export function garageArea(
  v: Pick<AdminVendor, 'city' | 'lat' | 'lng'> &
    Partial<Pick<AdminVendor, 'outsideServiceCity'>>
): string {
  return garageAreaName(v)
}

export type StageTone = 'done' | 'new' | 'attention' | 'late' | 'closed'

/** The Stage column: "Live", or what keeps it from customers, with its tone. */
export function stageCell(v: ListedFields): { label: string; tone: StageTone } {
  if (isInBin(v)) return { label: 'Bin', tone: 'closed' }
  const word = stateWord(v)
  if (word === null) return { label: 'Live', tone: 'done' }
  if (v.status === 'archived') return { label: word, tone: 'closed' }
  if (v.status === 'suspended') return { label: word, tone: 'late' }
  if (v.status === 'pending') return { label: word, tone: 'new' }
  return { label: word, tone: 'attention' }
}

/** The action a blocking or to-fix checklist item asks for, in a few words. */
const STEP_WORDS: Record<string, string> = {
  no_services: 'Add services',
  no_booking_type: 'Switch on a booking type',
  no_hours: 'Set opening hours',
  no_pin: 'Drop the map pin',
  pin_unconfirmed: 'Confirm the map pin',
  no_descriptions: 'Describe the services',
  no_vehicle_types: 'Add car types',
  retired_vehicle_types: 'Update car types',
  pickup_no_pin: 'Drop the map pin',
  pickup_terms_missing: 'Get the pickup agreement',
  no_bays: 'Set the bays',
  no_doorstep_radius: 'Set the travel radius',
  no_pickup_radius: 'Set the pickup radius',
}

export interface GarageNextStep {
  text: string
  detail?: string
  /** Red-orange: it can't go live. Amber: chase it. Grey: in hand. */
  tone: 'late' | 'attention' | 'neutral'
  /** The editor tab where it is done, when there is one. */
  tab?: ReadinessItem['tab']
}

const DAY_MS = 24 * 60 * 60 * 1000

/** "Mon 2 Nov" for a YYYY-MM-DD due date, read on India's calendar. */
function dueDay(dueOn: string, now: number): string {
  return formatDay(new Date(`${dueOn}T12:00:00+05:30`), now)
}

/** Whole days from today (India) to a YYYY-MM-DD date: 0 today, -1 yesterday. */
function daysUntil(dueOn: string, now: number): number {
  const istToday = new Date(now + 5.5 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  return Math.round(
    (Date.parse(`${dueOn}T00:00:00Z`) - Date.parse(`${istToday}T00:00:00Z`)) /
      DAY_MS
  )
}

/**
 * The Next step column (pattern 03): the one thing to do about the garage
 * now, most pressing first. Something blocking it from going live; then a
 * teammate collecting for it (due today, or late, in amber); then a
 * verification; then an ask that has waited past MARK_CHASE_AFTER_DAYS;
 * then the things still to collect; then what to fix. Null when there is
 * nothing to do.
 */
export function garageNextStep(
  v: ListedFields &
    Partial<
      Pick<
        AdminVendor,
        'readiness' | 'missing' | 'openMarks' | 'openCollection' | 'lat'
      >
    >,
  now: number
): GarageNextStep | null {
  if (isInBin(v) || v.status === 'archived') return null
  const readiness = v.readiness ?? []

  const blocking = readiness.find((item) => item.severity === 'blocking')
  if (blocking) {
    return {
      text: STEP_WORDS[blocking.key] ?? blocking.label,
      detail: 'Blocks going live',
      tone: 'late',
      tab: blocking.tab,
    }
  }

  // A teammate collecting: the action is the due date and how far along
  // ("Due Thu 29 Oct · 0 of 2"), with whom under it.
  const list = v.openCollection
  if (list) {
    const progress = `${list.done} of ${list.total}`
    const detail = `With ${list.assigneeName}`
    if (list.dueOn) {
      const days = daysUntil(list.dueOn, now)
      if (days < 0)
        return { text: `Overdue · ${progress}`, detail, tone: 'late' }
      if (days === 0)
        return { text: `Due today · ${progress}`, detail, tone: 'attention' }
      return {
        text: `Due ${dueDay(list.dueOn, now)} · ${progress}`,
        detail,
        tone: 'neutral',
      }
    }
    return { text: `Collecting · ${progress}`, detail, tone: 'neutral' }
  }

  // The server won't verify a garage with no pin: the pin comes first.
  if (!v.isVerified && v.status !== 'suspended') {
    return v.lat == null
      ? {
          text: 'Pin first',
          detail: 'Then verify',
          tone: 'attention',
          tab: 'location',
        }
      : {
          text: 'Verify',
          detail: 'Then customers can find it',
          tone: 'attention',
        }
  }

  const asked = (v.openMarks ?? [])
    .filter((mark) => mark.status === 'asked' && mark.askedAt)
    .map((mark) => Date.parse(mark.askedAt!))
    .filter((at) => Number.isFinite(at))
  if (asked.length > 0) {
    const days = Math.floor((now - Math.min(...asked)) / DAY_MS)
    if (days >= MARK_CHASE_AFTER_DAYS) {
      return {
        text: `Chase · ${days} days ago`,
        detail: 'Asked, no answer yet',
        tone: 'attention',
      }
    }
  }

  const missing = (v.missing ?? []).length
  if (missing > 0) {
    return {
      text: `Collect ${missing} ${missing === 1 ? 'thing' : 'things'}`,
      tone: 'neutral',
    }
  }

  const fix = readiness.find((item) => item.severity === 'fix')
  if (fix) {
    return {
      text: STEP_WORDS[fix.key] ?? fix.label,
      detail: 'Works, but fix soon',
      tone: 'neutral',
      tab: fix.tab,
    }
  }
  return null
}

/** What the Next step column sorts by: the most pressing first. */
export function nextStepRank(step: GarageNextStep | null): number {
  if (!step) return 0
  return step.tone === 'late' ? 3 : step.tone === 'attention' ? 2 : 1
}
