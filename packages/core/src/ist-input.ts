/**
 * India time for the admin's date and time fields.
 *
 * `<input type="datetime-local">` holds a wall-clock time with no zone, and
 * the old discount form read it in the device's zone: an admin travelling,
 * or a laptop left on UTC, set a code's window hours off. Detlio runs in
 * Chennai, so every start and end the panel types is India time, both ways,
 * whatever the computer's clock says. Worked out by hand rather than with
 * Intl, as the server's lib/ist.ts is: India keeps no daylight saving, so
 * IST is UTC+05:30 all year.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The moment's wall clock in India, read off a shifted UTC date. */
function istClock(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MS)
}

/**
 * `2026-08-27T10:30:00.000Z` → `2026-08-27T16:00`: what a datetime-local
 * input shows for that moment in India. Blank or unreadable gives ''.
 */
export function toIstInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return ''
  return istClock(new Date(time)).toISOString().slice(0, 16)
}

const INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

/**
 * `2026-08-27T16:00` read as India time → `2026-08-27T10:30:00.000Z`.
 * Blank gives null; so does anything that is not a real date and time
 * ("2026-02-30T10:00"), rather than a date the admin did not mean.
 */
export function fromIstInput(value: string): string | null {
  const match = INPUT_PATTERN.exec(value.trim())
  if (!match) return null
  const [, y, mo, d, h, mi, s] = match.map(Number)
  const wall = Date.UTC(y, mo - 1, d, h, mi, s || 0)
  const check = new Date(wall)
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d ||
    h > 23 ||
    mi > 59
  ) {
    return null
  }
  return new Date(wall - IST_OFFSET_MS).toISOString()
}

/** "10:00 AM": the minutes always shown, as a window's two ends are compared. */
function clockLabel(clock: Date): string {
  const hour = clock.getUTCHours()
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${String(clock.getUTCMinutes()).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
}

/** "Mon 12 Oct, 10:00 AM", in India time. */
export function istDateTimeLabel(iso: string): string {
  const clock = istClock(new Date(iso))
  return `${WEEKDAYS[clock.getUTCDay()]} ${clock.getUTCDate()} ${MONTHS[clock.getUTCMonth()]}, ${clockLabel(clock)}`
}

/**
 * "Mon 12 Oct, 10:00 AM → Sun 18 Oct, 11:59 PM IST": a window as the admin
 * reads it. A missing start reads "From saving"; a missing end, "no end".
 */
export function istWindowLabel(startsAt: string | null, endsAt: string | null): string {
  const from = startsAt ? istDateTimeLabel(startsAt) : 'From saving'
  const to = endsAt ? istDateTimeLabel(endsAt) : 'no end'
  return `${from} → ${to} IST`
}
