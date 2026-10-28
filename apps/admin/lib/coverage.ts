/**
 * The Coverage page's figures (0064, mockup coverage-zones), outside the
 * components: each zone's call list, its counts and colour, the totals, and
 * the area each zone is drawn as. Pure, unit-tested in coverage.test.ts.
 *
 * Which zone a garage is in comes from the API (the server's one zone rule,
 * lib/zones.ts zoneFor); a lead carries its zone. Nothing here decides a
 * zone; the drawn areas only picture the same rule (nearest centre within
 * 6 km).
 */
import type {
  CoverageGarage,
  CoverageOverview,
  CoverageRecommendation,
  CoverageZone,
  HotRule,
  Lead,
  ZoneDemand,
} from '@repo/core/api/admin-coverage'
import type { LeadStatus } from '@repo/core/leads'
import { ZONE_RADIUS_KM } from '@repo/core/zones'

/** A row of a zone's call list: a garage (with the lead it came from, if any) or a lead. */
export type CallRow =
  | { kind: 'garage'; id: string; garage: CoverageGarage; lead: Lead | null }
  | { kind: 'lead'; id: string; lead: Lead }

/** Where a row stands: a live garage is onboarded, a garage not live yet is still to target. */
export function rowStatus(row: CallRow): LeadStatus {
  if (row.kind === 'garage') return row.garage.live ? 'onboarded' : 'to_target'
  return row.lead.status
}

export function rowName(row: CallRow): string {
  return row.kind === 'garage' ? row.garage.name : row.lead.name
}

export function rowPin(row: CallRow): { lat: number; lng: number } | null {
  const point = row.kind === 'garage' ? row.garage : row.lead
  return point.lat !== null && point.lng !== null
    ? { lat: point.lat, lng: point.lng }
    : null
}

export type ZoneColour = 'green' | 'amber' | 'red' | 'grey'

export interface ZoneStats {
  zone: CoverageZone
  /** Live garages in the zone: "live / target". */
  live: number
  toTarget: number
  notInterested: number
  /** Every place the team knows in the zone. */
  known: number
  colour: ZoneColour
  rows: CallRow[]
}

/**
 * The zone's colour on the map and in the list:
 * green — the target met; red — a priority zone with nothing live;
 * grey — any other zone with nothing at all; amber — under target.
 */
export function zoneColour(
  zone: Pick<CoverageZone, 'priority' | 'target'>,
  live: number,
  known: number
): ZoneColour {
  if (live >= zone.target) return 'green'
  if (live === 0 && zone.priority) return 'red'
  if (known === 0) return 'grey'
  return 'amber'
}

const ROW_ORDER: Record<LeadStatus, number> = {
  to_target: 0,
  onboarded: 1,
  not_interested: 2,
}

/** A zone's rows: to target first (then onboarded, then not interested), each A–Z. */
export function sortRows(rows: CallRow[]): CallRow[] {
  return [...rows].sort(
    (a, b) =>
      ROW_ORDER[rowStatus(a)] - ROW_ORDER[rowStatus(b)] ||
      rowName(a).localeCompare(rowName(b), 'en')
  )
}

/**
 * Every garage and lead as call rows, by zone (null: outside every zone).
 * A lead that became a garage the page shows is that garage's row, with
 * the lead's note on it, never a second row.
 */
export function rowsByZone(
  overview: Pick<CoverageOverview, 'garages' | 'leads'>
): Map<string | null, CallRow[]> {
  const leadByGarage = new Map<string, Lead>()
  for (const lead of overview.leads)
    if (lead.vendorId) leadByGarage.set(lead.vendorId, lead)
  const shownGarages = new Set(overview.garages.map((garage) => garage.id))

  const byZone = new Map<string | null, CallRow[]>()
  const add = (zoneId: string | null, row: CallRow) => {
    const list = byZone.get(zoneId) ?? []
    list.push(row)
    byZone.set(zoneId, list)
  }
  for (const garage of overview.garages) {
    add(garage.zoneId, {
      kind: 'garage',
      id: `garage:${garage.id}`,
      garage,
      lead: leadByGarage.get(garage.id) ?? null,
    })
  }
  for (const lead of overview.leads) {
    if (lead.vendorId && shownGarages.has(lead.vendorId)) continue
    add(lead.zoneId, { kind: 'lead', id: `lead:${lead.id}`, lead })
  }
  return byZone
}

function countRows(rows: CallRow[]) {
  let live = 0
  let toTarget = 0
  let notInterested = 0
  for (const row of rows) {
    const status = rowStatus(row)
    if (status === 'onboarded') {
      // Only a live garage counts toward the target; a lead marked onboarded
      // whose garage is in the Bin is known, not live.
      if (row.kind === 'garage') live++
    } else if (status === 'to_target') toTarget++
    else notInterested++
  }
  return { live, toTarget, notInterested, known: rows.length }
}

/** Each zone with its counts, colour and sorted call list, in the API's order. */
export function zoneStats(
  overview: Pick<CoverageOverview, 'zones' | 'garages' | 'leads'>
): ZoneStats[] {
  const byZone = rowsByZone(overview)
  return overview.zones.map((zone) => {
    const rows = sortRows(byZone.get(zone.id) ?? [])
    const counts = countRows(rows)
    return {
      zone,
      ...counts,
      colour: zoneColour(zone, counts.live, counts.known),
      rows,
    }
  })
}

/** Garages and leads in no zone (no pin, or a pin outside every zone), for the list's last row. */
export function outsideRows(
  overview: Pick<CoverageOverview, 'garages' | 'leads'>
): CallRow[] {
  return sortRows(rowsByZone(overview).get(null) ?? [])
}

/** The list's filter: the priority zones only, or every zone (priority first, as the API orders them). */
export function listedZones(
  stats: ZoneStats[],
  filter: 'priority' | 'all'
): ZoneStats[] {
  return filter === 'priority' ? stats.filter((s) => s.zone.priority) : stats
}

/** The figures across the top. Every garage and lead, in a zone or not. */
export function coverageTotals(
  overview: Pick<CoverageOverview, 'zones' | 'garages' | 'leads'>
) {
  const rows = [...rowsByZone(overview).values()].flat()
  const counts = countRows(rows)
  return {
    priorityZones: overview.zones.filter((zone) => zone.priority).length,
    onboarded: counts.live,
    toTarget: counts.toTarget,
    notInterested: counts.notInterested,
  }
}

export type CallFilter = 'all' | LeadStatus

/** A zone drawer's filter: All, To target, Onboarded, Not interested. */
export function filterRows(rows: CallRow[], filter: CallFilter): CallRow[] {
  return filter === 'all'
    ? rows
    : rows.filter((row) => rowStatus(row) === filter)
}

export function filterCounts(rows: CallRow[]): Record<CallFilter, number> {
  const counts: Record<CallFilter, number> = {
    all: rows.length,
    to_target: 0,
    onboarded: 0,
    not_interested: 0,
  }
  for (const row of rows) counts[rowStatus(row)]++
  return counts
}

/** The stacked bar's three parts, in percent of what is known (all 0 for an empty zone). */
export function barParts(
  stats: Pick<ZoneStats, 'live' | 'toTarget' | 'notInterested' | 'rows'>
) {
  const onboardedRows = stats.rows.filter(
    (row) => rowStatus(row) === 'onboarded'
  ).length
  const total = stats.rows.length
  if (total === 0) return { onboarded: 0, toTarget: 0, notInterested: 0 }
  return {
    onboarded: (onboardedRows / total) * 100,
    toTarget: (stats.toTarget / total) * 100,
    notInterested: (stats.notInterested / total) * 100,
  }
}

/** "4 onboarded · 3 to target · 2 not interested". */
export function zoneSummaryLine(rows: CallRow[]): string {
  const counts = filterCounts(rows)
  return `${counts.onboarded} onboarded · ${counts.to_target} to target · ${counts.not_interested} not interested`
}

// ─── Demand (part 3) ────────────────────────────────────────────────────────

/** Each zone's demand by its id; empty from an API before part 3. */
export function demandByZone(
  overview: Pick<CoverageOverview, 'demand'>
): Map<string, ZoneDemand> {
  return new Map((overview.demand ?? []).map((d) => [d.zoneId, d]))
}

/**
 * The zone list in demand order: the API's score (people waiting + requests
 * nobody accepted), highest first; equal scores keep the API's order
 * (priority first, then A–Z). The score and Hot are the API's; this only
 * orders them.
 */
export function sortByDemand(
  stats: ZoneStats[],
  demand: Map<string, ZoneDemand>
): ZoneStats[] {
  return stats
    .map((s, order) => ({ s, order, score: demand.get(s.zone.id)?.score ?? 0 }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ s }) => s)
}

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

/** "12 waiting · 2 failed requests · 1 open request · 1 recommended", or null with no demand. */
export function demandLine(demand: ZoneDemand | undefined): string | null {
  if (!demand) return null
  const parts = [
    demand.waiting > 0 && `${demand.waiting} waiting`,
    demand.failedRequests > 0 &&
      count(demand.failedRequests, 'failed request', 'failed requests'),
    demand.openRequests > 0 &&
      count(demand.openRequests, 'open request', 'open requests'),
    demand.newRecommendations > 0 && `${demand.newRecommendations} recommended`,
  ].filter((part): part is string => typeof part === 'string')
  return parts.length > 0 ? parts.join(' · ') : null
}

/** What Hot means, in the API's own numbers. */
export function hotRuleText(rule: HotRule): string {
  return `Hot: the top ${rule.top} zones by people waiting plus requests nobody accepted in the last ${rule.requestDays} days, each with at least ${rule.minScore}.`
}

/** A zone's recommendations still to act on (null: those in no zone), newest first as the API sends them. */
export function newRecommendations(
  recommendations: readonly CoverageRecommendation[],
  zoneId: string | null
): CoverageRecommendation[] {
  return recommendations.filter(
    (rec) => rec.status === 'new' && rec.zoneId === zoneId
  )
}

/** The recommendations made into each lead, for "Recommended by a customer" on its row. */
export function recommendationsByLead(
  recommendations: readonly CoverageRecommendation[]
): Map<string, CoverageRecommendation[]> {
  const byLead = new Map<string, CoverageRecommendation[]>()
  for (const rec of recommendations) {
    if (!rec.leadId || rec.status === 'new' || rec.status === 'declined')
      continue
    byLead.set(rec.leadId, [...(byLead.get(rec.leadId) ?? []), rec])
  }
  return byLead
}

/** "Recommended by a customer · “Did my car well”" (by 2 customers, when more). */
export function recommendedLine(
  recommendations: readonly Pick<CoverageRecommendation, 'why'>[]
): string | null {
  if (recommendations.length === 0) return null
  const who =
    recommendations.length === 1
      ? 'Recommended by a customer'
      : `Recommended by ${recommendations.length} customers`
  const why = recommendations.find((rec) => rec.why)?.why
  return why ? `${who} · “${why}”` : who
}

// ─── The drawn areas ────────────────────────────────────────────────────────

type Point = { lat: number; lng: number }
type XY = { x: number; y: number }

const KM_PER_DEG_LAT = 111.32

function projector(origin: Point) {
  const kmPerDegLng = KM_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180)
  return {
    to: (p: Point): XY => ({
      x: (p.lng - origin.lng) * kmPerDegLng,
      y: (p.lat - origin.lat) * KM_PER_DEG_LAT,
    }),
    from: (p: XY): Point => ({
      lat: origin.lat + p.y / KM_PER_DEG_LAT,
      lng: origin.lng + p.x / kmPerDegLng,
    }),
  }
}

/** Keeps the part of the polygon on the side of the line nearer `a` than `b` (the perpendicular bisector). */
function clipNearer(polygon: XY[], a: XY, b: XY): XY[] {
  const nx = b.x - a.x
  const ny = b.y - a.y
  const limit = (b.x * b.x + b.y * b.y - a.x * a.x - a.y * a.y) / 2
  const inside = (p: XY) => p.x * nx + p.y * ny <= limit
  const out: XY[] = []
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i]
    const previous = polygon[(i + polygon.length - 1) % polygon.length]
    const currentIn = inside(current)
    const previousIn = inside(previous)
    if (currentIn !== previousIn) {
      const dp = previous.x * nx + previous.y * ny
      const dc = current.x * nx + current.y * ny
      const t = (limit - dp) / (dc - dp)
      out.push({
        x: previous.x + t * (current.x - previous.x),
        y: previous.y + t * (current.y - previous.y),
      })
    }
    if (currentIn) out.push(current)
  }
  return out
}

/**
 * The area a zone is drawn as: the points within 6 km of its centre that are
 * nearer to it than to any other centre — the picture of the zone rule. A
 * closed ring of [lng, lat] for GeoJSON. Drawn on a flat local projection,
 * which is exact enough at a city's scale.
 */
export function zoneArea(
  zone: Point & { id: string },
  zones: ReadonlyArray<Point & { id: string }>,
  steps = 64
): Array<[number, number]> {
  const project = projector(zone)
  let polygon: XY[] = Array.from({ length: steps }, (_, i) => {
    const angle = (2 * Math.PI * i) / steps
    return {
      x: ZONE_RADIUS_KM * Math.cos(angle),
      y: ZONE_RADIUS_KM * Math.sin(angle),
    }
  })
  const centre = { x: 0, y: 0 }
  for (const other of zones) {
    if (other.id === zone.id) continue
    const at = project.to(other)
    if (Math.hypot(at.x, at.y) > 2 * ZONE_RADIUS_KM) continue
    polygon = clipNearer(polygon, centre, at)
    if (polygon.length === 0) break
  }
  const ring = polygon.map((p) => {
    const point = project.from(p)
    return [point.lng, point.lat] as [number, number]
  })
  if (ring.length > 0) ring.push(ring[0])
  return ring
}

/** The colours each zone colour is drawn in (fill and edge), from the tone tokens' values. */
export const ZONE_PAINT: Record<
  ZoneColour,
  { fill: string; line: string; dot: string }
> = {
  green: { fill: '#22C55E', line: '#22C55E', dot: 'bg-tone-done-dot' },
  amber: { fill: '#F5A524', line: '#F5A524', dot: 'bg-tone-attention-dot' },
  red: { fill: '#FF6B57', line: '#FF6B57', dot: 'bg-tone-late-dot' },
  grey: { fill: '#8A8A93', line: '#8A8A93', dot: 'bg-tone-closed-dot' },
}

export const ZONE_COLOUR_LABELS: Record<ZoneColour, string> = {
  green: 'Target met',
  amber: 'In progress',
  red: 'Priority, nothing live',
  grey: 'Nothing yet',
}

/**
 * A dot per pinned garage and lead: green onboarded (a live garage), orange
 * to target (a lead, or a garage not live yet), red not interested.
 */
export function coverageDots(
  overview: Pick<CoverageOverview, 'garages' | 'leads'>
): Array<{
  id: string
  lat: number
  lng: number
  tone: 'green' | 'orange' | 'red'
  label: string
}> {
  const rows = [...rowsByZone(overview).values()].flat()
  return rows.flatMap((row) => {
    const pin = rowPin(row)
    if (!pin) return []
    const status = rowStatus(row)
    const tone =
      status === 'onboarded'
        ? 'green'
        : status === 'to_target'
          ? 'orange'
          : 'red'
    return [{ id: row.id, ...pin, tone, label: rowName(row) }]
  })
}
