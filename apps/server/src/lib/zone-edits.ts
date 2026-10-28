import { SERVICE_CITY, straightLineKm } from './service-city.js'
import { zoneFor, zoneSlug } from './zones.js'

/**
 * Editing Chennai's zones from admin (0064, Coverage): rename, priority,
 * target, move the centre, add and remove. Which zone a point is in stays
 * `zoneFor` (lib/zones.ts), the one rule; these are the rules for the edits
 * themselves. Pure, unit-tested in zone-edits.test.ts.
 */

export const ZONE_NAME_MIN = 2
export const ZONE_NAME_MAX = 60
export const ZONE_TARGET_MIN = 1
export const ZONE_TARGET_MAX = 1000

/** A zone's name as stored: trimmed, inner spaces folded. */
export function cleanZoneName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

export type ZoneEditProblem =
  'name_length' | 'name_letters' | 'name_taken' | 'target' | 'outside_city'

export const ZONE_EDIT_MESSAGES: Record<ZoneEditProblem, string> = {
  name_length: `A zone's name is ${ZONE_NAME_MIN} to ${ZONE_NAME_MAX} characters.`,
  name_letters: "A zone's name needs letters or numbers.",
  name_taken: 'Another zone already has that name.',
  target: `The target is a whole number from ${ZONE_TARGET_MIN} to ${ZONE_TARGET_MAX}.`,
  outside_city: `The centre must be within ${SERVICE_CITY.radiusKm} km of Chennai's centre.`,
}

interface ZoneLike {
  id: string
  slug: string
  name: string
  lat: number
  lng: number
}

/**
 * What is wrong with a zone as it would be after an edit (or a new one),
 * among the others, or null when it is fine. Names are compared without
 * case, as the unique index does.
 */
export function zoneEditProblem(
  zone: {
    id: string | null
    name: string
    target: number
    lat: number
    lng: number
  },
  others: readonly ZoneLike[]
): ZoneEditProblem | null {
  const name = cleanZoneName(zone.name)
  if (name.length < ZONE_NAME_MIN || name.length > ZONE_NAME_MAX)
    return 'name_length'
  if (!zoneSlug(name)) return 'name_letters'
  if (
    others.some(
      (other) =>
        other.id !== zone.id && other.name.toLowerCase() === name.toLowerCase()
    )
  ) {
    return 'name_taken'
  }
  if (
    !Number.isInteger(zone.target) ||
    zone.target < ZONE_TARGET_MIN ||
    zone.target > ZONE_TARGET_MAX
  ) {
    return 'target'
  }
  if (
    straightLineKm({ lat: zone.lat, lng: zone.lng }, SERVICE_CITY.centre) >
    SERVICE_CITY.radiusKm
  ) {
    return 'outside_city'
  }
  return null
}

/**
 * A new zone's slug: from its name, with -2, -3… when taken. A rename keeps
 * the slug, which customers' saved areas and the usage events' `area` name.
 */
export function newZoneSlug(name: string, taken: ReadonlySet<string>): string {
  const base = zoneSlug(cleanZoneName(name)).slice(0, 55).replace(/-+$/g, '')
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const slug = `${base}-${n}`
    if (!taken.has(slug)) return slug
  }
}

/**
 * The leads whose zone changes after the zones changed: each pinned lead
 * goes to `zoneFor` its pin among the zones as they are now (null: outside
 * every zone). A lead with no pin keeps the zone it was added in.
 */
export function leadZoneMoves(
  leads: ReadonlyArray<{
    id: string
    lat: number | null
    lng: number | null
    zoneId: string | null
  }>,
  zones: ReadonlyArray<{ id: string; lat: number; lng: number }>
): Array<{ id: string; zoneId: string | null }> {
  return leads.flatMap((lead) => {
    if (lead.lat === null || lead.lng === null) return []
    const zoneId = zoneFor(lead, zones)?.id ?? null
    return zoneId === lead.zoneId ? [] : [{ id: lead.id, zoneId }]
  })
}

/**
 * A lead's zone when it is saved: from its pin when it has one (null when
 * the pin is outside every zone), else the zone it was added in.
 */
export function leadZoneId(
  pin: { lat: number | null; lng: number | null },
  givenZoneId: string | null,
  zones: ReadonlyArray<{ id: string; lat: number; lng: number }>
): string | null {
  if (pin.lat !== null && pin.lng !== null)
    return zoneFor(pin, zones)?.id ?? null
  return givenZoneId && zones.some((zone) => zone.id === givenZoneId)
    ? givenZoneId
    : null
}
