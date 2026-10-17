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

/** The chips, in order. All is every garage, so the stages add up to it. */
export const SHOW_FILTERS = ['all', 'live', 'active', 'pending', 'suspended', 'archived'] as const
export type ShowFilter = (typeof SHOW_FILTERS)[number]

export const SHOW_LABELS: Record<ShowFilter, string> = {
  all: 'All',
  live: 'Live',
  active: 'Active',
  pending: 'Pending',
  suspended: 'Suspended',
  archived: 'Archived',
}

/** What the list opens on: the garages customers can find. */
export const DEFAULT_SHOW: ShowFilter = 'live'

/** The chip a `?show=` asks for, or Live. An allow-list, like `?tab=`. */
export function parseShow(value: string | null | undefined): ShowFilter {
  return value && (SHOW_FILTERS as readonly string[]).includes(value)
    ? (value as ShowFilter)
    : DEFAULT_SHOW
}

/** The list with a chip chosen: `/vendors` for the default, so Back is tidy. */
export function listHref(show: ShowFilter): string {
  return show === DEFAULT_SHOW ? '/vendors' : `/vendors?show=${show}`
}

type ListedFields = Pick<AdminVendor, 'live' | 'status' | 'isVerified' | 'bookingsPausedAt'>

/**
 * Whether customers can find the garage: the server's `live`. The fallback
 * is only for a server older than that field, during a deploy, so the list
 * does not open on an empty Live; it is the same rule (Active, verified, not
 * paused), and the server's flag wins whenever it is there.
 */
export function isLive(v: ListedFields): boolean {
  return v.live ?? (v.status === 'active' && v.isVerified && !v.bookingsPausedAt)
}

export function matchesShow(v: ListedFields, show: ShowFilter): boolean {
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
export function showHints(show: ShowFilter): Array<{ term: string; meaning: string }> {
  switch (show) {
    case 'pending':
      return [{ term: 'Pending', meaning: 'added, not shown to customers yet' }]
    case 'suspended':
      return [{ term: 'Suspended', meaning: 'stopped by Detlio, not shown to customers' }]
    case 'archived':
      return [{ term: 'Archived', meaning: 'put away, not shown to customers; its bookings are kept' }]
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
export function editHref(vendorId: string, back: string, tab?: ReadinessItem['tab']): string {
  const query = new URLSearchParams()
  if (tab) query.set('tab', tab)
  query.set('back', back)
  return `/vendors/${vendorId}/edit?${query.toString()}`
}
