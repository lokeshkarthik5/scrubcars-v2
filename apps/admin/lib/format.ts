/**
 * The admin's one way to write money, counts, times, dates and deadlines
 * (UX audit "Consistency system", quick win 7). Every admin screen imports
 * these from here, so the panel follows one set of rules; the money, time
 * and date ones are the shared @repo/core/format helpers.
 *
 *   formatMoney(1349)  "₹1,349"    formatMoney(758.4)  "₹758.40"
 *   formatCount(18234) "18,234"    formatTime(at)      "9:00 am"
 *   formatDay(at)      "Today", "Tue 20 Oct" (the year only when it isn't this one)
 *   formatDateTime(at) "Today · 9:00 am", "Tue 20 Oct · 9:00 am"
 *   formatRelative(at) "in 10 min", "2 h ago" (within 48 h)
 */
import {
  formatClock,
  formatDay,
  formatINR,
  formatRelative,
  formatWhen,
} from '@repo/core/format'

/** The shared helpers (@repo/core/format), under the names admin screens use. */
export { formatDay, formatRelative }
export const formatTime = formatClock
export const formatDateTime = formatWhen

export type DateInput = Date | string

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

const toDate = (at: DateInput) => (at instanceof Date ? at : new Date(at))
const valid = (date: Date) => !Number.isNaN(date.getTime())

/**
 * "₹1,349", "₹1,00,000", paise only when there are any ("₹758.40"). The
 * API's amounts arrive as strings ("1349.00"). "—" for nothing usable: a
 * figure that failed to load is never shown as ₹0.
 */
export function formatMoney(
  amount: number | string | null | undefined
): string {
  if (amount === null || amount === undefined || amount === '') return '—'
  return formatINR(Number(amount), { paise: true })
}

/** "18,234", grouped the Indian way, as money is. */
export function formatCount(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '—'
  const value = Math.round(Number(n))
  if (!Number.isFinite(value)) return '—'
  // formatINR groups the Indian way; its "₹" is all there is to drop.
  return formatINR(value).replace('₹', '')
}

/** Whole days between two moments on India's calendar: 0 today, 1 tomorrow. */
function istDayOffset(at: Date, now: number): number {
  const shift = (t: number) => Math.floor((t + 5.5 * HOUR_MS) / DAY_MS)
  return shift(at.getTime()) - shift(now)
}

/** "10 min", "26 h", "2 days". */
export function formatSpan(ms: number, round: 'up' | 'down' = 'up'): string {
  const abs = Math.abs(ms)
  if (abs < HOUR_MS) {
    const mins =
      round === 'up' ? Math.ceil(abs / MINUTE_MS) : Math.floor(abs / MINUTE_MS)
    return `${Math.max(1, mins)} min`
  }
  if (abs < 48 * HOUR_MS) return `${Math.floor(abs / HOUR_MS)} h`
  const days = Math.floor(abs / DAY_MS)
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

/**
 * One colour scale for every clock (quick win 1): red (the coral "late") under
 * 15 minutes or past it, amber when it is due today, grey otherwise.
 */
export type Urgency = 'late' | 'attention' | 'neutral'

export interface DeadlineText {
  text: string
  urgency: Urgency
}

/** Inside this a deadline is red even before it passes: a booking about to auto-cancel. */
export const URGENT_MS = 15 * MINUTE_MS

/**
 * "Cancels in 10 min" (red), "Late · 26 h" (red), "Decide by 4:00 pm" (amber,
 * today), "Decide by Fri 23 Oct · 10:00 am" (grey). Counts down inside the hour.
 */
export function deadlineText(
  due: DateInput,
  now: number,
  { verb = 'Due', lateText = 'Late' }: { verb?: string; lateText?: string } = {}
): DeadlineText {
  const at = toDate(due)
  if (!valid(at)) return { text: '', urgency: 'neutral' }
  const left = at.getTime() - now
  if (left <= 0)
    return {
      text: `${lateText} · ${formatSpan(left, 'down')}`,
      urgency: 'late',
    }
  const today = istDayOffset(at, now) === 0
  const urgency: Urgency =
    left <= URGENT_MS ? 'late' : today ? 'attention' : 'neutral'
  if (left <= HOUR_MS)
    return { text: `${verb} in ${formatSpan(left, 'up')}`, urgency }
  return {
    text: `${verb} by ${today ? formatClock(at) : formatWhen(at, now)}`,
    urgency,
  }
}

/** "Owed 2 days", "Waiting 41 min": amber after a day, red after two. */
export function ageText(
  since: DateInput,
  now: number,
  prefix = 'Owed'
): DeadlineText {
  const at = toDate(since)
  if (!valid(at)) return { text: '', urgency: 'neutral' }
  const age = Math.max(0, now - at.getTime())
  return {
    text: `${prefix} ${formatSpan(age, 'down')}`,
    urgency:
      age >= 2 * DAY_MS ? 'late' : age >= DAY_MS ? 'attention' : 'neutral',
  }
}

/** The text colour for an urgency, for a line that is not a chip. */
export const URGENCY_TEXT: Record<Urgency, string> = {
  late: 'text-tone-late-text',
  attention: 'text-warning',
  neutral: 'text-text-secondary',
}
