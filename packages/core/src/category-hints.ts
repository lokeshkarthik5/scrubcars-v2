import type { ServiceCategory } from './types'

/**
 * "Looks like Repairs · matched “clutch”": which of the mechanical and body
 * categories (0080) a service filed under Others probably belongs in, from
 * its name alone. Admin only (the garage editor's hint under the row, and
 * Settings → Services in Others); nothing ever moves without a tap.
 *
 * The owner's rules (screens of 16 Nov 2026):
 * - only services in Others are checked;
 * - keywords match whole words, in any case;
 * - Dent & paint is checked first, then Repairs, then General service, so
 *   "AC service" is Repairs and "Dent repair" is Dent & paint;
 * - never when the name also says a wash or detailing word, so "Engine bay
 *   cleaning" and "Paint protection film" get no hint;
 * - a bare "engine" is left out on purpose ("Engine oil change" is
 *   servicing, not a repair).
 *
 * Pure, and used by the admin app as is: the server lists Others and the
 * page decides, so the rule lives in this one place.
 */
export type HintCategory = Extract<ServiceCategory, 'general_service' | 'repairs' | 'dent_paint'>

/** The words looked for, by category, as the "Words we look for" card lists them. */
export const CATEGORY_HINT_KEYWORDS: Readonly<Record<HintCategory, readonly string[]>> = {
  general_service: [
    'service',
    'servicing',
    'periodic',
    'maintenance',
    'oil change',
    'engine oil',
    'oil filter',
    'air filter',
    'check-up',
    'checkup',
    'health check',
    'coolant',
    'spark plug',
    'tune-up',
    'alignment',
    'balancing',
    'top-up',
  ],
  repairs: [
    'repair',
    'engine repair',
    'brake',
    'clutch',
    'gearbox',
    'ac',
    'a/c',
    'air con',
    'compressor',
    'gas refill',
    'electrical',
    'wiring',
    'battery',
    'alternator',
    'starter',
    'suspension',
    'shock absorber',
    'steering',
    'radiator',
    'overhaul',
    'mechanic',
    'diagnosis',
    'scanning',
  ],
  dent_paint: [
    'dent',
    'denting',
    'tinkering',
    'paint',
    'painting',
    'repaint',
    'panel',
    'bumper',
    'body work',
    'bodywork',
    'rust',
  ],
}

/** The order the categories are tried in: the first that matches wins. */
export const CATEGORY_HINT_PRIORITY: readonly HintCategory[] = ['dent_paint', 'repairs', 'general_service']

/** Words that mean wash or detailing work: a name with one never gets a hint. */
export const CATEGORY_HINT_NEVER: readonly string[] = [
  'wash',
  'clean',
  'cleaning',
  'foam',
  'polish',
  'detailing',
  'coating',
  'ceramic',
  'teflon',
  'graphene',
  'ppf',
  'protection',
]

export interface CategoryHint {
  category: HintCategory
  /** The keyword that matched, as the list spells it ("clutch"). */
  keyword: string
}

/**
 * Where a keyword stands in a lower-cased name as a whole word, or -1. A
 * hyphen in a keyword also matches a space ("tune-up", "tune up").
 */
function wordAt(name: string, keyword: string): number {
  const pattern = keyword
    .split('-')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
    .join('[- ]')
  const match = new RegExp(`(^|[^a-z0-9])(${pattern})(?=$|[^a-z0-9])`).exec(name)
  return match ? match.index + match[1]!.length : -1
}

/**
 * The hint for one name, ignoring its category: the first category in
 * CATEGORY_HINT_PRIORITY with a keyword in the name, and of its keywords the
 * one that comes first in the name (the longer on a tie). Null when nothing
 * matches or the name has a wash or detailing word.
 */
export function matchCategoryHint(name: string): CategoryHint | null {
  const lower = name.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!lower) return null
  if (CATEGORY_HINT_NEVER.some((word) => wordAt(lower, word) !== -1)) return null
  for (const category of CATEGORY_HINT_PRIORITY) {
    let best: { keyword: string; at: number } | null = null
    for (const keyword of CATEGORY_HINT_KEYWORDS[category]) {
      const at = wordAt(lower, keyword)
      if (at === -1) continue
      if (!best || at < best.at || (at === best.at && keyword.length > best.keyword.length)) {
        best = { keyword, at }
      }
    }
    if (best) return { category, keyword: best.keyword }
  }
  return null
}

/**
 * The hint a service shows: only for a service in Others whose hint was not
 * turned down ("Not this", kept on the service).
 */
export function categoryHintFor(service: {
  name: string
  category: string
  hintDismissed?: boolean
}): CategoryHint | null {
  if (service.category !== 'others' || service.hintDismissed) return null
  return matchCategoryHint(service.name)
}
