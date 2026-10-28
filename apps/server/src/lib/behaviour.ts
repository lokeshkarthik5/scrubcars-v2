/**
 * Statistics → Behaviour (0061): where customers leave on the way from the
 * landing page to a paid booking. Pure, so every rule has a test; the
 * repository (modules/behaviour) only groups usage events (0040) by visit.
 *
 * - **Sessions are the unit**: a visit is one browser tab (the random
 *   visit id the app keeps in sessionStorage). The funnel's population is
 *   the visits that landed on the homepage in the period; each later step
 *   counts those of them that did it at any point in the visit. A step can
 *   be skipped (a search opens a garage without a card seen first), so the
 *   count left at a step is never below zero.
 * - **A step nothing records yet** (zero visits while a later step has
 *   some, such as "Picked an area" before the landing page's area chips
 *   ship) is shown as not measured, and the drops skip over it.
 * - **Left out**: visits by the team (an account with super_admin, or one
 *   whose number is a team login's phone), visits that made a booking
 *   marked Test, and, never recorded at all, Do-Not-Track/GPC browsers and
 *   team devices (?team-device=1).
 */
import type { AnalyticsEventName, Channel } from './analytics.js'

export const BEHAVIOUR_STEPS = [
  { key: 'landed', label: 'Landed', events: ['landing_view'] },
  { key: 'garageSeen', label: 'Saw a garage', events: ['garage_card_seen'] },
  { key: 'area', label: 'Picked an area', events: ['area_pick'] },
  { key: 'garage', label: 'Opened a garage', events: ['garage_view'] },
  // Adding a service from its card skips the details sheet, but it is the
  // same interest.
  { key: 'service', label: 'Opened a service', events: ['service_sheet_open', 'service_add'] },
  // Book Now on a garage's page, or checkout for a customer already there.
  { key: 'booking', label: 'Started booking', events: ['booking_start', 'checkout_start'] },
  // A sign-in code sent; a visit already signed in gave its number before.
  { key: 'number', label: 'Gave a number', events: ['otp_sent'] },
  { key: 'paid', label: 'Paid', events: ['pay_success'] },
] as const satisfies ReadonlyArray<{ key: string; label: string; events: readonly AnalyticsEventName[] }>

export type BehaviourStepKey = (typeof BEHAVIOUR_STEPS)[number]['key']

/** Every event the funnel reads. */
export const BEHAVIOUR_EVENTS: readonly AnalyticsEventName[] = [
  ...new Set(BEHAVIOUR_STEPS.flatMap((step) => [...step.events])),
]

/** The Source filter: Instagram, Google, Direct, or everything else. */
export const BEHAVIOUR_SOURCES = ['all', 'instagram', 'google', 'direct', 'other'] as const
export type BehaviourSource = (typeof BEHAVIOUR_SOURCES)[number]

/** The Device filter. Desktop is every screen 640px wide or more (tablets too). */
export const BEHAVIOUR_DEVICES = ['all', 'phone', 'desktop'] as const
export type BehaviourDevice = (typeof BEHAVIOUR_DEVICES)[number]

/** The channels Source = Other covers: none of the named ones (or none known). */
export function sourceOf(channel: Channel | string | null): Exclude<BehaviourSource, 'all'> {
  return channel === 'instagram' || channel === 'google' || channel === 'direct' ? channel : 'other'
}

/** Visits grouped by what they did, as the repository reads them. */
export interface BehaviourSessionGroup {
  /** The distinct events the visits did. */
  names: string[]
  /** The visits' last event, in time. */
  lastName: string | null
  /** Any of its events carried an account (signed in, or joined on sign-in). */
  signedIn: boolean
  /** An account on the visit is the team's. */
  team: boolean
  /** An account on the visit made a booking marked Test during it. */
  test: boolean
  sessions: number
}

export interface BehaviourStep {
  key: BehaviourStepKey
  label: string
  /** Visits that landed and did this step; null when nothing records it yet. */
  count: number | null
  /** Visits lost since the last measured step before it (never below 0); null for the first or an unmeasured one. */
  lost: number | null
  /** This step over that step, 0–1 (capped); null when it can't be said. */
  ofPrevious: number | null
  /** This step over visits that landed, 0–1. */
  ofLanded: number | null
}

export interface BehaviourFunnel {
  steps: BehaviourStep[]
  /** The step most visits were lost before; ties go to the earlier one. */
  biggestLeak: { key: BehaviourStepKey; from: BehaviourStepKey; lost: number } | null
}

const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null)
const capped = (value: number | null) => (value === null ? null : Math.min(1, value))

function didStep(group: BehaviourSessionGroup, step: (typeof BEHAVIOUR_STEPS)[number]): boolean {
  if (step.key === 'number' && group.signedIn) return true
  return step.events.some((event) => group.names.includes(event))
}

/** The funnel over visits that landed (groups already without team and Test visits). */
export function behaviourFunnel(groups: BehaviourSessionGroup[]): BehaviourFunnel {
  const landed = groups.filter((group) => group.names.includes('landing_view'))
  const raw = BEHAVIOUR_STEPS.map((step) =>
    landed.reduce((sum, group) => sum + (didStep(group, step) ? group.sessions : 0), 0)
  )
  // A step with nobody while a later step has some is one nothing records yet.
  const measured = raw.map((count, i) => i === 0 || count > 0 || !raw.slice(i + 1).some((later) => later > 0))
  const total = raw[0]

  let previous: { key: BehaviourStepKey; count: number } | null = null
  let biggestLeak: BehaviourFunnel['biggestLeak'] = null
  const steps: BehaviourStep[] = BEHAVIOUR_STEPS.map((step, i) => {
    if (!measured[i]) {
      return { key: step.key, label: step.label, count: null, lost: null, ofPrevious: null, ofLanded: null }
    }
    const count = raw[i]
    const lost = previous ? Math.max(0, previous.count - count) : null
    const out: BehaviourStep = {
      key: step.key,
      label: step.label,
      count,
      lost,
      // Capped at 1: a skipped step can have more than the one before it.
      ofPrevious: previous ? capped(ratio(count, previous.count)) : null,
      ofLanded: ratio(count, total),
    }
    if (previous && lost !== null && lost > 0 && (!biggestLeak || lost > biggestLeak.lost)) {
      biggestLeak = { key: step.key, from: previous.key, lost }
    }
    previous = { key: step.key, count }
    return out
  })
  return { steps, biggestLeak }
}

/** What a visit's last event says, as the page shows it. */
export const LAST_STEP_LABELS: Partial<Record<AnalyticsEventName, string>> = {
  app_open: 'Opened the site',
  landing_view: 'Landing page',
  garage_card_seen: 'Saw a garage card',
  garage_list_view: 'Garage list',
  area_pick: 'Picked an area',
  mode_switch: 'Switched At garage / Doorstep / Pickup',
  search: 'Search',
  map_view: 'Map',
  garage_view: "A garage's page",
  service_sheet_open: "A service's details",
  service_add: 'Added a service',
  booking_start: 'Pressed Book Now',
  otp_sent: 'Sign-in code sent',
  checkout_start: 'Checkout',
  slot_select: 'Picked a time',
  address_select: 'Picked an address',
  pay_click: 'Pressed Pay',
  pay_failed: 'Payment failed',
  home_view: 'Home',
  help_view: 'Help',
  favourite_add: 'Saved a garage',
  favourite_remove: 'Removed a saved garage',
  coupon_scan: "A coupon's page",
  coupon_redeem: 'Added a coupon',
  banner_view: 'Saw a banner',
  banner_close: 'Closed a banner',
  request_sent: 'Sent a request',
  free_wash_claim: 'Claimed a free wash',
}

export interface LastStepRow {
  event: string
  label: string
  sessions: number
  /** Of every visit that landed and did not pay. */
  share: number | null
}

/**
 * The last thing visits did before leaving: of the visits that landed and
 * did not pay, the most common last events, most first (ties by name).
 */
export function lastStepsBeforeLeaving(groups: BehaviourSessionGroup[], top = 5): { leavers: number; rows: LastStepRow[] } {
  const leavers = groups.filter(
    (group) => group.names.includes('landing_view') && !group.names.includes('pay_success')
  )
  const counts = new Map<string, number>()
  let total = 0
  for (const group of leavers) {
    total += group.sessions
    const event = group.lastName ?? 'landing_view'
    counts.set(event, (counts.get(event) ?? 0) + group.sessions)
  }
  const rows = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([event, sessions]) => ({
      event,
      label: LAST_STEP_LABELS[event as AnalyticsEventName] ?? event,
      sessions,
      share: ratio(sessions, total),
    }))
  return { leavers: total, rows }
}

export interface BehaviourSummary {
  /** Every visit in the period and filters, team and Test ones left out. */
  visits: number
  /** Visits left out: the team's, and ones that made a Test booking. */
  leftOut: { team: number; test: number }
  funnel: BehaviourFunnel
  lastSteps: { leavers: number; rows: LastStepRow[] }
}

/** The whole tab from the repository's groups. */
export function summariseBehaviour(groups: BehaviourSessionGroup[]): BehaviourSummary {
  let team = 0
  let test = 0
  const kept: BehaviourSessionGroup[] = []
  for (const group of groups) {
    if (group.team) team += group.sessions
    else if (group.test) test += group.sessions
    else kept.push(group)
  }
  return {
    visits: kept.reduce((sum, group) => sum + group.sessions, 0),
    leftOut: { team, test },
    funnel: behaviourFunnel(kept),
    lastSteps: lastStepsBeforeLeaving(kept),
  }
}
