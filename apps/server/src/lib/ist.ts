/**
 * Calendar dates and short labels in Chennai time, for Home and Updates.
 *
 * The server decides "today", "due in 2 days" and "Till Sat 17 Oct" itself,
 * in Asia/Kolkata, so a phone set to another zone cannot move a due date.
 * Worked out by hand rather than with toLocaleString, for the reason
 * lib/receipts.ts gives: Intl's "en-IN" output differs between ICU versions.
 * Date keys are "YYYY-MM-DD", as lib/slots.ts uses them.
 */

/** IST is UTC+05:30 all year: India keeps no daylight saving. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function istParts(date: Date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    /** 0 = January. */
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    ms: shifted.getUTCMilliseconds(),
  }
}

/** The IST calendar date of a moment, as "YYYY-MM-DD". */
export function istDateKey(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

/** Whole calendar days from `from` to `to` (both date keys); negative if earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

/** A date key plus some days. */
export function addDays(dateKey: string, days: number): string {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** The instant an IST calendar day starts. */
export function istMidnight(dateKey: string): Date {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) - IST_OFFSET_MS)
}

/** "Sat 17 Oct": the IST date, with its weekday. */
export function istDayLabel(date: Date): string {
  const p = istParts(date)
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month]}`
}

/** "Sat" */
export function istWeekdayLabel(date: Date): string {
  return WEEKDAYS[istParts(date).weekday]
}

/** "6 PM", or "6:30 PM" when the minutes are not zero. */
export function istTimeLabel(date: Date): string {
  const p = istParts(date)
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12
  const meridiem = p.hour < 12 ? 'AM' : 'PM'
  return p.minute === 0
    ? `${hour12} ${meridiem}`
    : `${hour12}:${String(p.minute).padStart(2, '0')} ${meridiem}`
}

/** "Sat 17 Oct, 10 AM": a booking's slot. */
export function istSlotShortLabel(date: Date): string {
  return `${istDayLabel(date)}, ${istTimeLabel(date)}`
}
