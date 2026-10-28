/**
 * Team-wide admin settings (0064, `admin_settings`): the Garages list's
 * onboarding target and the colour tags' names. One row per key, set from
 * the Garages page by anyone signed in to admin, with who and when.
 *
 * What is stored is read through these parsers, which fall back to the
 * defaults field by field, so a row written by an older or newer panel can
 * never break the page.
 *
 * Twin: packages/core/src/garage-target.ts (the defaults, colour keys and
 * limits), pinned by admin-settings.parity.test.ts. Pure.
 */

// ─── Colour tags ─────────────────────────────────────────────────────────────

/** The team's colours for a garage, in the order the panel lists them. */
export const COLOUR_TAGS = ['green', 'amber', 'red', 'blue'] as const
export type ColourTag = (typeof COLOUR_TAGS)[number]

export function isColourTag(value: unknown): value is ColourTag {
  return typeof value === 'string' && (COLOUR_TAGS as readonly string[]).includes(value)
}

/** The names everyone sees until the team renames them (mockup garages-list). */
export const DEFAULT_COLOUR_NAMES: Record<ColourTag, string> = {
  green: 'All confirmed',
  amber: 'A few to confirm',
  red: 'Needs details',
  blue: 'Call back',
}

export const COLOUR_NAME_MAX = 30

export type ColourNames = Record<ColourTag, string>

/** The stored names over the defaults: a missing or blank name is the default. */
export function parseColourNames(value: unknown): ColourNames {
  const stored = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const names = { ...DEFAULT_COLOUR_NAMES }
  for (const tag of COLOUR_TAGS) {
    const name = stored[tag]
    if (typeof name === 'string' && name.trim()) names[tag] = name.trim().slice(0, COLOUR_NAME_MAX)
  }
  return names
}

// ─── The onboarding target ───────────────────────────────────────────────────

/** What the counter counts: live garages, or every garage onboarded. */
export const TARGET_COUNTS = ['live', 'onboarded'] as const
export type TargetCounts = (typeof TARGET_COUNTS)[number]

export interface GarageTarget {
  target: number
  /** The day to reach it by, "YYYY-MM-DD", or none. */
  endsOn: string | null
  counts: TargetCounts
}

export const TARGET_MAX = 10_000

export const DEFAULT_GARAGE_TARGET: GarageTarget = { target: 50, endsOn: null, counts: 'live' }

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** The stored target over the default, field by field. */
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
