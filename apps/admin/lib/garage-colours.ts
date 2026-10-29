/**
 * The Garages list's colour tags (0064, mockup garages-list): the team's own
 * colour for a garage — green "All confirmed", amber "A few to confirm", red
 * "Needs details", blue "Call back" (with a day), or none — shown as a soft
 * row tint with a coloured edge, filtered by chips with counts, and sorted
 * by. The names are team-wide (Rename colours); the app never sets one.
 * Pure, so every rule is tested here.
 */
import type { AdminVendor } from '@repo/core/api/admin'
import {
  COLOUR_TAGS,
  isColourTag,
  type ColourNames,
  type ColourTag,
} from '@repo/core/garage-target'

/** A chip: one colour, or the garages with none. */
export type ColourFilter = ColourTag | 'none'

export const COLOUR_FILTERS: readonly ColourFilter[] = [...COLOUR_TAGS, 'none']

export function parseColourFilter(value: string | null): ColourFilter | null {
  if (value === 'none') return 'none'
  return isColourTag(value) ? value : null
}

type Coloured = Pick<AdminVendor, 'colourTag'>

/** The garage's colour, or null (none, or an API older than 0064). */
export function colourOf(v: Coloured): ColourTag | null {
  return isColourTag(v.colourTag) ? v.colourTag : null
}

export function matchesColour(
  v: Coloured,
  filter: ColourFilter | null
): boolean {
  if (!filter) return true
  const tag = colourOf(v)
  return filter === 'none' ? tag === null : tag === filter
}

/** How many garages wear each colour, and how many none. */
export function colourCounts(
  vendors: readonly Coloured[]
): Record<ColourFilter, number> {
  const counts: Record<ColourFilter, number> = {
    green: 0,
    amber: 0,
    red: 0,
    blue: 0,
    none: 0,
  }
  for (const v of vendors) counts[colourOf(v) ?? 'none'] += 1
  return counts
}

/** The Colour column's sort: in the chips' order, none last. */
export function colourSortValue(v: Coloured): number | null {
  const tag = colourOf(v)
  return tag === null ? null : COLOUR_TAGS.indexOf(tag)
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
const DAY_MS = 24 * 60 * 60 * 1000

/** Today in Chennai, "YYYY-MM-DD". */
export function istToday(now: number): string {
  return new Date(now + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * A Call back day as the tag says it: "today", "tomorrow", the weekday
 * within the week ahead ("Thu"), else the date ("12 Nov"); a day gone by is
 * "was 24 Oct", so an overdue call stands out.
 */
export function callDayText(day: string, now: number): string {
  const at = Date.parse(`${day}T00:00:00Z`)
  if (Number.isNaN(at)) return ''
  const today = Date.parse(`${istToday(now)}T00:00:00Z`)
  const ahead = Math.round((at - today) / DAY_MS)
  const date = new Date(at)
  const short = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
  if (ahead === 0) return 'today'
  if (ahead === 1) return 'tomorrow'
  if (ahead > 1 && ahead < 7) return WEEKDAYS[date.getUTCDay()]
  if (ahead < 0) return `was ${short}`
  return short
}

/** The tag's words: its name, with the day on a Call back ("Call back Thu"). */
export function colourText(
  v: Pick<AdminVendor, 'colourTag' | 'colourTagCallOn'>,
  names: ColourNames,
  now: number
): string | null {
  const tag = colourOf(v)
  if (!tag) return null
  const day =
    tag === 'blue' && v.colourTagCallOn
      ? callDayText(v.colourTagCallOn, now)
      : ''
  return day ? `${names[tag]} ${day}` : names[tag]
}

/** "Set by Mathew · 28 Oct": whose call the colour was. */
export function colourSetLine(
  v: Pick<AdminVendor, 'colourTagSetBy' | 'colourTagSetAt'>,
  now: number
): string | null {
  if (!v.colourTagSetBy) return null
  if (!v.colourTagSetAt) return `Set by ${v.colourTagSetBy}`
  const day = istToday(Date.parse(v.colourTagSetAt))
  const date = new Date(`${day}T00:00:00Z`)
  const thisYear = istToday(now).slice(0, 4) === day.slice(0, 4)
  const when = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}${thisYear ? '' : ` ${day.slice(0, 4)}`}`
  return `Set by ${v.colourTagSetBy} · ${when}`
}

/** The row's tint and 3px edge, and the dot, per colour (the app's tones). */
export const COLOUR_STYLES: Record<
  ColourTag,
  { row: string; dot: string; chip: string }
> = {
  green: {
    row: 'bg-tone-done-tint/50 shadow-[inset_3px_0_0_var(--color-tone-done-dot)]',
    dot: 'bg-tone-done-dot',
    chip: 'border-tone-done-dot/60',
  },
  amber: {
    row: 'bg-tone-attention-tint/50 shadow-[inset_3px_0_0_var(--color-tone-attention-dot)]',
    dot: 'bg-tone-attention-dot',
    chip: 'border-tone-attention-dot/60',
  },
  red: {
    row: 'bg-tone-late-tint/50 shadow-[inset_3px_0_0_var(--color-tone-late-dot)]',
    dot: 'bg-tone-late-dot',
    chip: 'border-tone-late-dot/60',
  },
  blue: {
    row: 'bg-tone-progress-tint/50 shadow-[inset_3px_0_0_var(--color-tone-progress-dot)]',
    dot: 'bg-tone-progress-dot',
    chip: 'border-tone-progress-dot/60',
  },
}
