import { APP_TIMEZONE } from '@repo/core/utils'

/**
 * One day of a garage's week, as the API sends it.
 *
 * `dayOfWeek` is 0 = Sunday … 6 = Saturday, and the times are the garage's own
 * wall-clock times ("08:30:00"), which the server reads as IST — the same rule
 * the slot picker is built on (see apps/server/src/lib/slots.ts).
 */
export interface OpeningDay {
  dayOfWeek: number
  openTime: string
  closeTime: string
  isClosed: boolean
}

export interface OpenStatus {
  isOpen: boolean
  /**
   * Today is one of the garage's holidays, so it is shut all day whatever its
   * weekly hours say: "Closed today" rather than a bare "Closed".
   */
  closedToday: boolean
  /**
   * What follows "Open · " or "Closed · ": "closes 7 PM", "opens 9 AM
   * tomorrow". Null when there is nothing to add.
   */
  detail: string | null
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + (minutes || 0)
}

/** "19:00:00" → "7 PM", "08:30:00" → "8:30 AM". Minutes only when they exist. */
function formatClock(time: string): string {
  const total = toMinutes(time) % (24 * 60)
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  const meridiem = hours < 12 ? 'AM' : 'PM'
  return minutes === 0
    ? `${hour12} ${meridiem}`
    : `${hour12}:${String(minutes).padStart(2, '0')} ${meridiem}`
}

/**
 * The weekday and minute-of-day in the app's timezone, not the device's: a
 * customer whose phone is set to another zone is still asking about a garage
 * in India.
 */
function wallClock(now: Date): { day: number; minutes: number; date: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''

  return {
    day: WEEKDAYS.indexOf(part('weekday') as (typeof WEEKDAYS)[number]),
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
    // en-CA renders YYYY-MM-DD, the same date key the holidays come in.
    date: now.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE }),
  }
}

/** A YYYY-MM-DD key plus some days. UTC date arithmetic, so no DST edges. */
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/**
 * Whether a garage is open right now, from its weekly hours.
 *
 * Returns null when the hours are unknown — no rows, or a response that did
 * not carry them — so the caller shows nothing rather than guessing. That is
 * the point of this helper: the badge it replaced said "Open" whenever the
 * account was active, at 2 AM and on the weekly off day alike.
 *
 * A day with no row is closed — the server's slot generator reads it the same
 * way. A day whose closing time is not after its opening time (an overnight
 * shift, or "00:00–00:00" meant as all day) is a shape nothing else in the
 * system understands either, so it makes the whole answer unknown rather than
 * a confident "Closed" that may be wrong.
 *
 * `closures` are the garage's holidays as IST dates ("2026-10-20"). A holiday
 * is shut all day: today being one makes it "Closed today", and the search for
 * the next opening steps over them.
 */
export function openStatus(
  hours: readonly OpeningDay[] | null | undefined,
  now: Date = new Date(),
  closures: readonly string[] = []
): OpenStatus | null {
  if (!hours || hours.length === 0) return null
  if (
    hours.some(
      (h) => !h.isClosed && toMinutes(h.closeTime) <= toMinutes(h.openTime)
    )
  ) {
    return null
  }

  const hoursOn = (day: number) => {
    const row = hours.find((h) => h.dayOfWeek === day)
    if (!row || row.isClosed) return null
    return { open: toMinutes(row.openTime), close: toMinutes(row.closeTime), row }
  }

  const { day: today, minutes, date } = wallClock(now)
  // Unparseable clock (should not happen with a real Intl): say nothing.
  if (today < 0 || !Number.isFinite(minutes)) return null

  const holidays = new Set(closures)
  const closedToday = holidays.has(date)

  const current = closedToday ? null : hoursOn(today)
  if (current && minutes >= current.open && minutes < current.close) {
    return {
      isOpen: true,
      closedToday: false,
      detail: `closes ${formatClock(current.row.closeTime)}`,
    }
  }

  // The next opening: later today, then each following day. Offset 7 is the
  // same weekday next week, reached only when today's opening has passed and
  // no other day opens at all. A holiday is skipped like an off day; the
  // search goes no further than a week, so a garage shut for longer says only
  // "Closed".
  for (let offset = 0; offset <= 7; offset++) {
    const day = (today + offset) % 7
    const next = hoursOn(day)
    if (!next || (offset === 0 && next.open <= minutes)) continue
    if (holidays.has(addDays(date, offset))) continue

    const at = formatClock(next.row.openTime)
    const detail =
      offset === 0
        ? `opens ${at}`
        : offset === 1
          ? `opens ${at} tomorrow`
          : offset === 7
            ? // Today's weekday again: without "next", "opens Mon 9 AM" read
              // on a Monday evening looks like this morning.
              `opens next ${WEEKDAYS[day]} ${at}`
            : `opens ${WEEKDAYS[day]} ${at}`
    return { isOpen: false, closedToday, detail }
  }

  // Hours are set, and the garage has marked every day closed — or every
  // opening in the coming week falls on a holiday.
  return { isOpen: false, closedToday, detail: null }
}
