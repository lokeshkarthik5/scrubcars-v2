/**
 * The date and time picker's arithmetic (components/checkout/when-picker.tsx),
 * pure so it is unit-tested. Dates are IST calendar keys, "YYYY-MM-DD";
 * date-only sums run in UTC, which has no daylight saving to trip on.
 */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
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
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

export interface DayChip {
  value: string
  dayOfWeek: number
  dayName: string
  day: number
  monthName: string
}

/** "2026-10-31" + 1 → "2026-11-01". */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** What a day's chip says. */
export function dateChipOf(key: string): DayChip {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return {
    value: key,
    dayOfWeek: date.getUTCDay(),
    dayName: DAY_NAMES[date.getUTCDay()],
    day: date.getUTCDate(),
    monthName: MONTH_NAMES[date.getUTCMonth()],
  }
}

/** `count` days from `today`, today first. */
export function weekOf(today: string, count: number): DayChip[] {
  return Array.from({ length: count }, (_, i) =>
    dateChipOf(addDaysToKey(today, i))
  )
}

/**
 * The first day after `from` + `skip` days that is open, looking `limit` days
 * at most. `skip` -1 means `from` itself counts. Null when every day is shut.
 */
export function firstOpenDayAfter(
  from: string,
  skip: number,
  isClosed: (key: string) => boolean,
  limit: number
): string | null {
  for (let i = skip + 1; i <= skip + limit; i++) {
    const key = addDaysToKey(from, i)
    if (!isClosed(key)) return key
  }
  return null
}

/**
 * The day's start times split at noon (Chennai time): the morning, shown
 * first, and the afternoon and evening, one tap away.
 */
export function splitByMorning(times: readonly string[]): {
  morning: string[]
  later: string[]
} {
  const morning: string[] = []
  const later: string[] = []
  for (const time of times) {
    const hour = new Date(
      new Date(time).getTime() + IST_OFFSET_MS
    ).getUTCHours()
    ;(hour < 12 ? morning : later).push(time)
  }
  return { morning, later }
}
