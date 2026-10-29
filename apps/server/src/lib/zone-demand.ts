/**
 * Demand per zone (admin round part 3, 0064): what customers ask for in
 * each zone, for Coverage's zone list and call lists. Pure, unit-tested in
 * zone-demand.test.ts. Every rule it counts by is customer reach's own
 * (#94): a request's state is `requestState` (lib/booking-requests.ts) and
 * an issued free wash is usable by `freeWashReady` (lib/area-signups.ts).
 */
import { freeWashReady } from './area-signups.js'
import { requestState } from './booking-requests.js'

/**
 * "Hot": the zones to recruit in first. A zone's score is the customers
 * waiting on its free-wash list plus the requests sent from it that nobody
 * accepted in the last 30 days; the top 3 by score are Hot, each with a
 * score of at least 10 (so a quiet city has no Hot zone at all).
 */
export const HOT_ZONE_RULES = {
  top: 3,
  minScore: 10,
  requestDays: 30,
} as const

/** A sign-up, with its free wash's code once issued. */
export interface SignupFact {
  zoneId: string
  freeWash: boolean
  /** The issued code (launch day); null before, or when none was issued. */
  discount: { isActive: boolean; held: number; endsAt: Date | null } | null
}

/** A request, by its latest row (the one not passed on). */
export interface RequestFact {
  zoneSlug: string | null
  status: string
  reply: string | null
}

export interface RecommendationFact {
  zoneId: string | null
  status: string
}

export interface ZoneDemand {
  zoneId: string
  /** On the zone's free-wash list while it is not live yet (live: 0). */
  waiting: number
  /** Everyone who ever signed up there. */
  signups: number
  /** Sign-ups holding a free wash they have not used (holdsUnusedFreeWash). */
  unusedFreeWashes: number
  /** Requests sent from the zone in the last 30 days, one per request however many garages it went to. */
  requests: number
  /** Of those, still waiting for a garage or for the customer to confirm. */
  openRequests: number
  /** Of those, nobody accepted (`no_garage`). */
  failedRequests: number
  /** Customer recommendations of a garage there, any state. */
  recommendations: number
  /** Of those, not yet made a lead or dismissed. */
  newRecommendations: number
  /** waiting + failedRequests: what Hot ranks by. */
  score: number
  hot: boolean
}

/**
 * Whether a sign-up holds a free wash it has not used: one of the first 50
 * of a zone not live yet (promised, issued on launch day), or an issued
 * code that is still usable. A zone that went live without issuing one
 * leaves nothing to hold.
 */
export function holdsUnusedFreeWash(
  signup: Pick<SignupFact, 'freeWash' | 'discount'>,
  zoneLive: boolean,
  now: Date
): boolean {
  if (!signup.freeWash) return false
  if (!signup.discount) return !zoneLive
  return freeWashReady(signup.discount, now)
}

/** Whether a request ended with nobody accepting it. */
export function requestFailed(
  request: Pick<RequestFact, 'status' | 'reply'>
): boolean {
  return requestState(request) === 'no_garage'
}

/**
 * The Hot zones: by score, then more waiting, then the zones' own order
 * (priority first, then A–Z, as GET /admin/coverage lists them); the first
 * HOT_ZONE_RULES.top with at least HOT_ZONE_RULES.minScore.
 */
export function hotZoneIds(
  demands: ReadonlyArray<Pick<ZoneDemand, 'zoneId' | 'score' | 'waiting'>>
): Set<string> {
  const ranked = demands
    .map((demand, order) => ({ demand, order }))
    .filter(({ demand }) => demand.score >= HOT_ZONE_RULES.minScore)
    .sort(
      (a, b) =>
        b.demand.score - a.demand.score ||
        b.demand.waiting - a.demand.waiting ||
        a.order - b.order
    )
  return new Set(
    ranked.slice(0, HOT_ZONE_RULES.top).map(({ demand }) => demand.zoneId)
  )
}

/**
 * Each zone's demand, in the zones' order. `requests` are already the last
 * 30 days' (HOT_ZONE_RULES.requestDays), by their latest row; a request is
 * matched to its zone by the slug it was sent with (a rename keeps it).
 */
export function zoneDemand(
  zones: ReadonlyArray<{ id: string; slug: string; liveAt: Date | null }>,
  facts: {
    signups: readonly SignupFact[]
    requests: readonly RequestFact[]
    recommendations: readonly RecommendationFact[]
  },
  now: Date
): ZoneDemand[] {
  const bySlug = new Map(zones.map((zone) => [zone.slug, zone.id]))
  const live = new Map(zones.map((zone) => [zone.id, zone.liveAt !== null]))
  const empty = (zoneId: string): ZoneDemand => ({
    zoneId,
    waiting: 0,
    signups: 0,
    unusedFreeWashes: 0,
    requests: 0,
    openRequests: 0,
    failedRequests: 0,
    recommendations: 0,
    newRecommendations: 0,
    score: 0,
    hot: false,
  })
  const out = new Map(zones.map((zone) => [zone.id, empty(zone.id)]))

  for (const signup of facts.signups) {
    const row = out.get(signup.zoneId)
    if (!row) continue
    const zoneLive = live.get(signup.zoneId) === true
    row.signups++
    if (!zoneLive) row.waiting++
    if (holdsUnusedFreeWash(signup, zoneLive, now)) row.unusedFreeWashes++
  }
  for (const request of facts.requests) {
    const zoneId = request.zoneSlug ? bySlug.get(request.zoneSlug) : undefined
    const row = zoneId ? out.get(zoneId) : undefined
    if (!row) continue
    row.requests++
    const state = requestState(request)
    if (state === 'waiting' || state === 'accepted') row.openRequests++
    if (state === 'no_garage') row.failedRequests++
  }
  for (const recommendation of facts.recommendations) {
    const row = recommendation.zoneId
      ? out.get(recommendation.zoneId)
      : undefined
    if (!row) continue
    row.recommendations++
    if (recommendation.status === 'new') row.newRecommendations++
  }

  const rows = zones.map((zone) => {
    const row = out.get(zone.id)!
    row.score = row.waiting + row.failedRequests
    return row
  })
  const hot = hotZoneIds(rows)
  for (const row of rows) row.hot = hot.has(row.zoneId)
  return rows
}

/** What still points at a zone, so it can't be removed. */
export interface ZoneUsage {
  leads: number
  signups: number
  requests: number
  recommendations: number
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

/**
 * Why a zone can't be removed, or null when nothing points at it. Leads can
 * be moved or removed; customers' sign-ups, requests and recommendations
 * keep the zone (their foreign keys are RESTRICT, and a request keeps its
 * slug), so a zone customers have used can only be renamed.
 */
export function zoneRemovalBlock(
  name: string,
  usage: ZoneUsage
): string | null {
  const parts = [
    usage.signups > 0 &&
      plural(usage.signups, 'free-wash sign-up', 'free-wash sign-ups'),
    usage.requests > 0 && plural(usage.requests, 'request', 'requests'),
    usage.recommendations > 0 &&
      plural(
        usage.recommendations,
        'customer recommendation',
        'customer recommendations'
      ),
    usage.leads > 0 && plural(usage.leads, 'lead', 'leads'),
  ].filter((part): part is string => typeof part === 'string')
  if (parts.length === 0) return null
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  const customers = usage.signups + usage.requests + usage.recommendations > 0
  return customers
    ? `${name} is kept: it has ${list}. A zone customers have used can't be removed; rename it instead.`
    : `${name} is kept: it has ${list}. Move ${usage.leads === 1 ? 'it' : 'them'} to another zone or remove ${usage.leads === 1 ? 'it' : 'them'} first.`
}
