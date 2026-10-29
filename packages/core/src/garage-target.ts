/**
 * The Garages list's colour tags and onboarding target (0064): the apps'
 * side of apps/server/src/lib/admin-settings.ts, pinned by
 * admin-settings.parity.test.ts (keys, defaults, limits and parsing).
 *
 * The figures the counter shows are worked out in the admin panel from the
 * garage list it already holds (apps/admin/lib/garage-target.ts).
 */

export const COLOUR_TAGS = ['green', 'amber', 'red', 'blue'] as const
export type ColourTag = (typeof COLOUR_TAGS)[number]

export function isColourTag(value: unknown): value is ColourTag {
  return typeof value === 'string' && (COLOUR_TAGS as readonly string[]).includes(value)
}

export const DEFAULT_COLOUR_NAMES: Record<ColourTag, string> = {
  green: 'All confirmed',
  amber: 'A few to confirm',
  red: 'Needs details',
  blue: 'Call back',
}

/** A line under each colour in the picker (mockup garages-list, B). */
export const COLOUR_HINTS: Record<ColourTag, string> = {
  green: 'Details checked with the owner',
  amber: 'Most details in, some to check',
  red: 'Little or nothing collected yet',
  blue: 'Add a day: "Call back Thu"',
}

export const COLOUR_NAME_MAX = 30

export type ColourNames = Record<ColourTag, string>

export function parseColourNames(value: unknown): ColourNames {
  const stored = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const names = { ...DEFAULT_COLOUR_NAMES }
  for (const tag of COLOUR_TAGS) {
    const name = stored[tag]
    if (typeof name === 'string' && name.trim()) names[tag] = name.trim().slice(0, COLOUR_NAME_MAX)
  }
  return names
}

export const TARGET_COUNTS = ['live', 'onboarded'] as const
export type TargetCounts = (typeof TARGET_COUNTS)[number]

export interface GarageTarget {
  target: number
  endsOn: string | null
  counts: TargetCounts
}

export const TARGET_MAX = 10_000

export const DEFAULT_GARAGE_TARGET: GarageTarget = { target: 50, endsOn: null, counts: 'live' }

const DAY = /^\d{4}-\d{2}-\d{2}$/

export function parseGarageTarget(value: unknown): GarageTarget {
  const stored = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const target =
    typeof stored.target === 'number' && Number.isInteger(stored.target) && stored.target >= 1 && stored.target <= TARGET_MAX
      ? stored.target
      : DEFAULT_GARAGE_TARGET.target
  const endsOn = typeof stored.endsOn === 'string' && DAY.test(stored.endsOn) ? stored.endsOn : null
  const counts = (TARGET_COUNTS as readonly unknown[]).includes(stored.counts)
    ? (stored.counts as TargetCounts)
    : DEFAULT_GARAGE_TARGET.counts
  return { target, endsOn, counts }
}
