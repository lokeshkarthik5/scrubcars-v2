import { t, tn } from './i18n/translate'

/**
 * The arithmetic behind the customer app's special moments (customer UI
 * round, Nov 2026, §7): the ticket's countdown, the "they answer by" ring,
 * the Home wash gauge, Indian number plates, the road the booking travels,
 * and the words a search matched. Pure, with every clock passed in, so what a
 * moment shows is tested without a browser; the components only draw it.
 */

const MINUTE_MS = 60_000

/** Days, hours and minutes left until a moment, for the ticket card's three boxes. */
export interface CountdownParts {
  days: number
  hours: number
  minutes: number
  /** The moment has come (or gone): every box reads 0. */
  past: boolean
}

/**
 * What is left until `target`, in whole minutes rounded up, so the last
 * minute still reads "1 min" rather than "0 min" while the time is ahead.
 */
export function countdownParts(target: number, now: number): CountdownParts {
  const left = target - now
  if (!Number.isFinite(left) || left <= 0) return { days: 0, hours: 0, minutes: 0, past: true }
  const total = Math.ceil(left / MINUTE_MS)
  return {
    days: Math.floor(total / 1440),
    hours: Math.floor((total % 1440) / 60),
    minutes: total % 60,
    past: false,
  }
}

/**
 * The countdown in words, for screen readers (the boxes are drawn, not
 * read): "2 days, 1 hour and 14 minutes", "45 minutes", "Starting now".
 */
export function countdownWords(parts: CountdownParts): string {
  if (parts.past) return t('Starting now')
  const words = [
    parts.days > 0 ? tn(parts.days, '{count} day', '{count} days') : null,
    parts.hours > 0 ? tn(parts.hours, '{count} hour', '{count} hours') : null,
    parts.minutes > 0 ? tn(parts.minutes, '{count} minute', '{count} minutes') : null,
  ].filter((word): word is string => word !== null)
  if (words.length === 0) return t('Starting now')
  return words.length === 1
    ? words[0]
    : t('{list} and {last}', { list: words.slice(0, -1).join(', '), last: words[words.length - 1] })
}

/** A box's figure: two places for hours and minutes ("01"), the days as they are. */
export function countdownBox(value: number, unit: 'days' | 'hours' | 'minutes'): string {
  return unit === 'days' ? String(value) : String(value).padStart(2, '0')
}

/** The garage's answer deadline as the booking carries it (0042). */
export interface AnswerDeadline {
  respondBy: string
  windowMins: number
}

/**
 * The "they answer by" ring: how much of the garage's time to answer is
 * left (1 full, 0 gone), and the whole minutes left while the clock is
 * running. A deadline further off than the window itself (the clock starts
 * when the garage next opens) is a full ring with no minutes: the ring then
 * names the time instead, as the garage's own countdown does.
 */
export function answerByRing(
  deadline: AnswerDeadline,
  now: number
): { fraction: number; minutesLeft: number | null } {
  const left = Date.parse(deadline.respondBy) - now
  if (!Number.isFinite(left) || left <= 0) return { fraction: 0, minutesLeft: 0 }
  const window = Math.max(1, deadline.windowMins) * MINUTE_MS
  if (left > window) return { fraction: 1, minutesLeft: null }
  return {
    fraction: Math.min(1, Math.max(0, left / window)),
    minutesLeft: Math.max(1, Math.ceil(left / MINUTE_MS)),
  }
}

/**
 * Where the Home wash gauge's needle settles, in degrees from straight up:
 * -90 on the left (just washed), +90 on the right (the car's wash interval
 * reached, the existing wash-status rule's due day). It never goes past the
 * end stop: an overdue car pins the needle there and the tile says by how
 * much. No wash on record leaves it at rest on the left.
 */
export function washGaugeAngle(daysSinceWash: number | null, intervalDays: number): number {
  return -90 + 180 * washGaugeShare(daysSinceWash, intervalDays)
}

/** The same reading as a share of the arc (0–1), for the arc's fill. */
export function washGaugeShare(daysSinceWash: number | null, intervalDays: number): number {
  if (daysSinceWash === null || !Number.isFinite(daysSinceWash)) return 0
  const interval = Math.max(1, intervalDays)
  return Math.min(1, Math.max(0, daysSinceWash / interval))
}

/**
 * A number plate written the way Indian plates are laid out: "tn07cd9036"
 * and "TN 7 CD 9036" both read "TN 07 CD 9036", and a Bharat series plate
 * "22BH1234AA" reads "22 BH 1234 AA". Anything that is not a plate's shape
 * is left as the customer typed it, in capitals with single spaces, rather
 * than guessed at.
 */
export function formatIndianPlate(plate: string): string {
  const typed = plate.trim().toUpperCase().replace(/\s+/g, ' ')
  const compact = typed.replace(/[^A-Z0-9]/g, '')
  const bharat = compact.match(/^(\d{2})BH(\d{4})([A-Z]{1,2})$/)
  if (bharat) return `${bharat[1]} BH ${bharat[2]} ${bharat[3]}`
  const state = compact.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/)
  if (state) {
    const [, code, district, series, number] = state
    return [code, district.padStart(2, '0'), series, number.padStart(4, '0')].filter(Boolean).join(' ')
  }
  return typed
}

/**
 * Where a stop sits on the road, as a share of its length: the first at 0,
 * the last (the garage) at 1, the rest evenly between.
 */
export function roadStopAt(index: number, stops: number): number {
  if (stops <= 1) return 1
  return Math.min(1, Math.max(0, index / (stops - 1)))
}

/** One run of a result's text: matched by the search, or not. */
export interface MatchSpan {
  text: string
  match: boolean
}

/**
 * A result's text cut into the runs a search matched and the runs it did
 * not, for the red-light underline under the words that found it. Each word
 * of the query of two letters or more is matched anywhere, ignoring case;
 * overlapping matches join into one run. No query (or nothing found) is the
 * whole text, unmatched.
 */
export function matchSpans(text: string, query: string): MatchSpan[] {
  const words = Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .map((word) => word.trim())
        .filter((word) => word.length >= 2)
    )
  )
  if (!text || words.length === 0) return text ? [{ text, match: false }] : []
  const lower = text.toLowerCase()
  const marked = new Array<boolean>(text.length).fill(false)
  for (const word of words) {
    let from = lower.indexOf(word)
    while (from !== -1) {
      for (let i = from; i < from + word.length; i++) marked[i] = true
      from = lower.indexOf(word, from + word.length)
    }
  }
  const spans: MatchSpan[] = []
  for (let i = 0; i < text.length; i++) {
    const last = spans[spans.length - 1]
    if (last && last.match === marked[i]) last.text += text[i]
    else spans.push({ text: text[i], match: marked[i] })
  }
  return spans
}

/** How far a pull has to travel before letting go refreshes the list, in px. */
export const PULL_REFRESH_PX = 72

/**
 * A pull-to-refresh gesture's progress: the finger's travel is damped (the
 * list moves half as far as the finger, as on a phone), and the share of the
 * way to the refresh point drives where the little car has rolled to.
 */
export function pullProgress(fingerTravel: number): { offset: number; share: number; ready: boolean } {
  const offset = Math.max(0, fingerTravel) / 2
  const share = Math.min(1, offset / PULL_REFRESH_PX)
  return { offset: Math.min(offset, PULL_REFRESH_PX * 1.4), share, ready: offset >= PULL_REFRESH_PX }
}
