/**
 * Edit zones' fields (0064): what is typed, what is wrong with it, and what
 * changed. Pure, unit-tested in zone-editor.test.ts. The API holds the rules
 * that need the other zones (a name taken, the centre within Chennai):
 * apps/server/src/lib/zone-edits.ts.
 */
import type { CoverageZone } from '@repo/core/api/admin-coverage'

export interface ZoneDraft {
  name: string
  priority: boolean
  target: string
  lat: string
  lng: string
}

export function zoneDraftFrom(
  zone: Pick<CoverageZone, 'name' | 'priority' | 'target' | 'lat' | 'lng'>
): ZoneDraft {
  return {
    name: zone.name,
    priority: zone.priority,
    target: String(zone.target),
    lat: String(zone.lat),
    lng: String(zone.lng),
  }
}

const number = (value: string) => (value.trim() === '' ? NaN : Number(value))

/** What is wrong with the fields, in words, or null. */
export function zoneDraftProblem(draft: ZoneDraft): string | null {
  const name = draft.name.trim().replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > 60)
    return 'A name of 2 to 60 characters.'
  if (!/[a-z0-9]/i.test(name)) return 'A name needs letters or numbers.'
  const target = number(draft.target)
  if (!Number.isInteger(target) || target < 1 || target > 1000)
    return 'The target is a whole number from 1 to 1000.'
  const lat = number(draft.lat)
  const lng = number(draft.lng)
  if (
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180
  ) {
    return 'Type the centre, or pick it on the map.'
  }
  return null
}

/** Only what changed, for PATCH (the centre as a pair). Call with a draft that has no problem. */
export function zoneChanges(
  zone: Pick<CoverageZone, 'name' | 'priority' | 'target' | 'lat' | 'lng'>,
  draft: ZoneDraft
): {
  name?: string
  priority?: boolean
  target?: number
  lat?: number
  lng?: number
} {
  const changes: {
    name?: string
    priority?: boolean
    target?: number
    lat?: number
    lng?: number
  } = {}
  const name = draft.name.trim().replace(/\s+/g, ' ')
  if (name !== zone.name) changes.name = name
  if (draft.priority !== zone.priority) changes.priority = draft.priority
  if (Number(draft.target) !== zone.target)
    changes.target = Number(draft.target)
  if (Number(draft.lat) !== zone.lat || Number(draft.lng) !== zone.lng) {
    changes.lat = Number(draft.lat)
    changes.lng = Number(draft.lng)
  }
  return changes
}
