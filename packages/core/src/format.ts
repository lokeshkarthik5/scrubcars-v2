/**
 * One way to write money, times and dates in all three apps (the UX audit's
 * consistency system): "₹1,25,000", "9:00 am", "Tue 20 Oct",
 * "Today · 12:30 pm", "5 min ago". Pure, no React.
 *
 * Every time is India time whatever the device's zone says. Worked out by
 * hand rather than with Intl, as ist-input.ts is: India keeps no daylight
 * saving, so IST is UTC+05:30 all year, and a fixed shift is both exact and
 * the same on every runtime (Intl's "am"/"AM" differs between them).
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

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
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** U+2212, the minus sign: a hyphen is shorter than the ₹ beside it. */
const MINUS = '−'

function toTime(at: string | Date): number {
  return at instanceof Date ? at.getTime() : Date.parse(at)
}

/** The moment's India wall clock, read off a shifted UTC date. */
function istClock(time: number): Date {
  return new Date(time + IST_OFFSET_MS)
}

/** Days since the epoch on India's calendar, so two moments compare by date. */
function istDayNumber(time: number): number {
  return Math.floor((time + IST_OFFSET_MS) / DAY_MS)
}

/** "1,25,00,000": the last three digits, then pairs (the Indian system). */
function groupIndian(whole: string): string {
  if (whole.length <= 3) return whole
  const head = whole.slice(0, -3)
  const tail = whole.slice(-3)
  return `${head.replace(/\B(?=(\d{2})+$)/g, ',')},${tail}`
}

/**
 * "₹1,25,000". Whole rupees unless `paise` is set, and then paise only
 * when there are any ("₹758.40", but "₹1,998", not "₹1,998.00"), so a
 * column never mixes the two for the same kind of figure. A negative
 * amount is "−₹500". Not a number gives "—": a figure that failed to
 * load is never shown as ₹0.
 */
export function formatINR(
  amount: number,
  opts: { paise?: boolean } = {}
): string {
  if (!Number.isFinite(amount)) return '—'
  const paise = Math.round(Math.abs(amount) * 100)
  const rupees = opts.paise ? Math.floor(paise / 100) : Math.round(paise / 100)
  const rest = opts.paise ? paise % 100 : 0
  if (rupees === 0 && rest === 0) return '₹0'
  const sign = amount < 0 ? MINUS : ''
  const decimals = rest > 0 ? `.${String(rest).padStart(2, '0')}` : ''
  return `${sign}₹${groupIndian(String(rupees))}${decimals}`
}

/** "9:00 am", "12:30 pm": lower-case, no leading zero. Unreadable gives ''. */
export function formatClock(at: string | Date): string {
  const time = toTime(at)
  if (Number.isNaN(time)) return ''
  const clock = istClock(time)
  const hours = clock.getUTCHours()
  const minutes = String(clock.getUTCMinutes()).padStart(2, '0')
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'am' : 'pm'}`
}

/**
 * "Today", "Tomorrow", "Yesterday", else "Tue 20 Oct", by India's calendar.
 * The year is added ("Tue 20 Oct 2027") only when it isn't now's.
 */
export function formatDay(at: string | Date, now: number = Date.now()): string {
  const time = toTime(at)
  if (Number.isNaN(time)) return ''
  const diff = istDayNumber(time) - istDayNumber(now)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  const clock = istClock(time)
  const year = clock.getUTCFullYear()
  const date = `${WEEKDAYS[clock.getUTCDay()]} ${clock.getUTCDate()} ${MONTHS[clock.getUTCMonth()]}`
  return year === istClock(now).getUTCFullYear() ? date : `${date} ${year}`
}

/** "Today · 12:30 pm", "Tue 20 Oct · 9:00 am". */
export function formatWhen(
  at: string | Date,
  now: number = Date.now()
): string {
  const day = formatDay(at, now)
  return day && `${day} · ${formatClock(at)}`
}

/**
 * "just now", "5 min ago", "2 h ago", "yesterday", "3 days ago", then the
 * day ("Tue 20 Oct"); the future the same way: "in 20 min", "in 2 h",
 * "tomorrow", "in 3 days". Minutes round towards the moment itself (down
 * when it's past, up when it's ahead), so a countdown never says less time
 * is left than there is. A week or more away gives the day.
 */
export function formatRelative(
  at: string | Date,
  now: number = Date.now()
): string {
  const time = toTime(at)
  if (Number.isNaN(time)) return ''
  const diff = time - now
  const ahead = diff > 0
  const gap = Math.abs(diff)
  if (gap < MINUTE_MS) return 'just now'

  const minutes = ahead
    ? Math.ceil(gap / MINUTE_MS)
    : Math.floor(gap / MINUTE_MS)
  if (minutes < 60) return ahead ? `in ${minutes} min` : `${minutes} min ago`

  const hours = Math.floor(gap / HOUR_MS)
  if (hours < 24) return ahead ? `in ${hours} h` : `${hours} h ago`

  const days = Math.abs(istDayNumber(time) - istDayNumber(now))
  if (days <= 1) return ahead ? 'tomorrow' : 'yesterday'
  if (days < 7) return ahead ? `in ${days} days` : `${days} days ago`
  return formatDay(at, now)
}

export type DeadlineKind = 'closed' | 'running' | 'urgent' | 'missed'

export interface DeadlineState {
  kind: DeadlineKind
  /** "By 9:30 am", "22 min", "1 h 05 min", "4 min" or "Missed". */
  label: string
  /** What is left of the window, 0..1, for a draining bar. */
  fractionLeft: number
}

/** "22 min", or "1 h 05 min" once it's over an hour. */
function minutesLabel(minutes: number): string {
  if (minutes <= 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
}

/**
 * A deadline's four looks, the same on every screen (garage mockup 04):
 *
 *   closed   "By 9:30 am" while the shop is shut and the clock hasn't started
 *            (the day is added when it's further off than tomorrow)
 *   running  "22 min", with a draining bar
 *   urgent   "4 min", amber, at or under `urgentMins` (default 5)
 *   missed   "Missed"
 *
 * Minutes round up, so "1 min" is the last thing it says before Missed.
 * `fractionLeft` is measured against `startedAt` when given; without it
 * the window's length is unknown, so it stays 1 (full) until the urgent
 * window, then drains across that.
 */
export function deadlineState(
  deadline: string | Date,
  opts: {
    now?: number
    shopOpen?: boolean
    startedAt?: string | Date
    urgentMins?: number
  } = {}
): DeadlineState {
  const { now = Date.now(), shopOpen = true, startedAt, urgentMins = 5 } = opts
  const end = toTime(deadline)
  // Unreadable: say nothing rather than a false "Missed".
  if (Number.isNaN(end)) return { kind: 'closed', label: '—', fractionLeft: 1 }

  const left = end - now
  if (left <= 0) return { kind: 'missed', label: 'Missed', fractionLeft: 0 }

  const urgentMs = Math.max(0, urgentMins) * MINUTE_MS
  const start = startedAt === undefined ? NaN : toTime(startedAt)
  const total = end - start
  const fraction = (value: number) => Math.min(1, Math.max(0, value))
  const fractionLeft = total > 0 ? fraction(left / total) : null

  if (!shopOpen) {
    const far = istDayNumber(end) - istDayNumber(now) > 1
    return {
      kind: 'closed',
      label: `By ${far ? formatWhen(deadline, now) : formatClock(deadline)}`,
      fractionLeft: fractionLeft ?? 1,
    }
  }

  const label = minutesLabel(Math.ceil(left / MINUTE_MS))
  if (left <= urgentMs) {
    return {
      kind: 'urgent',
      label,
      fractionLeft:
        fractionLeft ?? (urgentMs > 0 ? fraction(left / urgentMs) : 0),
    }
  }
  return { kind: 'running', label, fractionLeft: fractionLeft ?? 1 }
}
