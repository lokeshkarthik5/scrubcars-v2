import type { ServiceReminder } from '@repo/core/api/car-history'

/**
 * How a car's history page and its reminder card say things. Pure, with the
 * clock passed in, so every line is unit-tested. Dates are Chennai dates,
 * worked out by hand from "YYYY-MM-DD" keys and the fixed +05:30 offset, as
 * home-display.ts does.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** A date key's parts; the weekday from UTC noon, so no zone can move it. */
function keyParts(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`)
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate(), weekday: date.getUTCDay() }
}

function istYear(date: Date): number {
  return new Date(date.getTime() + IST_OFFSET_MS).getUTCFullYear()
}

function istKey(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

/** "Sat 12 Apr", with the year when it is not this one ("Sat 12 Apr 2027"). */
export function dueDayLabel(dateKey: string, now: Date): string {
  const p = keyParts(dateKey)
  const base = `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month]}`
  return p.year === istYear(now) ? base : `${base} ${p.year}`
}

/** When a job was done: "2 Oct", or "28 Dec 2025" in another year. */
export function historyDateLabel(atIso: string, now: Date): string {
  const p = keyParts(istKey(new Date(atIso)))
  return p.year === istYear(now) ? `${p.day} ${MONTHS[p.month]}` : `${p.day} ${MONTHS[p.month]} ${p.year}`
}

/** "Dec 2025": since when the totals count. */
export function sinceLabel(dateKey: string): string {
  const p = keyParts(dateKey)
  return `${MONTHS[p.month]} ${p.year}`
}

/**
 * The reminder's due line: "Due today", "Due tomorrow", "Due in 5 days",
 * "Due Sat 12 Apr" further off, "3 days overdue", or, once a booking
 * answers it, "Booked for Thu 16 Apr".
 */
export function reminderDueLine(
  reminder: Pick<ServiceReminder, 'state' | 'daysLeft' | 'dueOn' | 'booked'>,
  now: Date
): string {
  if (reminder.state === 'booked' && reminder.booked) {
    return `Booked for ${dueDayLabel(istKey(new Date(reminder.booked.scheduledAt)), now)}`
  }
  const days = reminder.daysLeft ?? 0
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days <= 7) return `Due in ${days} days`
  return `Due ${dueDayLabel(reminder.dueOn, now)}`
}

/** Snoozing only means something once it is close: due within a week, or overdue. */
export function canSnoozeReminder(reminder: Pick<ServiceReminder, 'state'>): boolean {
  return reminder.state === 'due_soon' || reminder.state === 'due' || reminder.state === 'overdue'
}

/** Where "Book" goes: the search, narrowed to the service that answers it. */
export function reminderBookHref(reminder: { bookCategory: string }): string {
  return `/search?category=${encodeURIComponent(reminder.bookCategory)}`
}

/** "Exterior Wash, Interior Vacuum". */
export function servicesLine(services: Array<{ name: string }>): string {
  return services.length === 0 ? 'Service' : services.map((service) => service.name).join(', ')
}

/** "3 washes", "1 wash". Every job is a wash in the app's words, as Rate your wash asks of any job. */
export function washCount(count: number): string {
  return `${count} wash${count === 1 ? '' : 'es'}`
}
