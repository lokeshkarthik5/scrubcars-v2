/**
 * Garage Book's rules (0069, modules/garage-book; SPEC.md in the owner's
 * reference folder, OK'd 9 Nov 2026). Pure, with the clock passed in. The
 * apps hold the same rules and words in packages/core/src/garage-book.ts
 * (garage-book.parity.test.ts keeps them in step).
 *
 * Owner decisions this file carries:
 *
 *   - A Detlio customer's phone number is never shown to the garage.
 *     Reminders to them go through Detlio, as a free app notification, at
 *     most one per customer per garage every 7 days.
 *   - The garage's own customers are its own; reminders to them open the
 *     garage's own WhatsApp with the message typed in (a wa.me link, ₹0).
 *   - The message can be edited, is capped, and carries no link.
 *   - Staff (vendor_operator) see no money: totals, Stats, Money owed,
 *     Payouts and the Excel download are the owner's alone, and the server
 *     leaves the figures out, not only the screen.
 */
import { addDays, daysBetween, istDateKey } from './ist.js'

export const GARAGE_BOOK_LIMITS = {
  nameMax: 120,
  noteMax: 500,
  messageMax: 500,
  linesMax: 20,
  carsMax: 10,
  /** A walk-in's price, in rupees, at most. */
  linePriceMaxRupees: 200_000,
  /** How many customers one list returns. */
  listMax: 500,
  /** How far back a garage may date a walk-in, and how far ahead. */
  pastDays: 31,
  futureDays: 90,
} as const

/** The garage's reminder message until it writes its own. */
export const DEFAULT_REMINDER_MESSAGE =
  'Hi {name}, your {car} is due for its wash at {garage}. Reply here or call {phone} to book a time.'

/** Days between washes when neither the car nor the job says. */
export const DEFAULT_INTERVAL_DAYS = 30

/** One Detlio push per customer per garage in this many days. */
export const DETLIO_PUSH_EVERY_DAYS = 7

export const JOB_STATUSES = ['booked', 'in_progress', 'done', 'cancelled'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export const JOB_PAYMENTS = ['upi', 'cash', 'later'] as const
export type JobPayment = (typeof JOB_PAYMENTS)[number]

export const CUSTOMER_FILTERS = ['all', 'detlio', 'own'] as const
export type CustomerFilter = (typeof CUSTOMER_FILTERS)[number]

/** Where a walk-in may go next. Done and cancelled are the end. */
const NEXT: Record<JobStatus, readonly JobStatus[]> = {
  booked: ['in_progress', 'done', 'cancelled'],
  in_progress: ['done', 'cancelled', 'booked'],
  done: [],
  cancelled: [],
}

export function canMoveJob(from: JobStatus, to: JobStatus): boolean {
  return from === to || NEXT[from].includes(to)
}

/**
 * Why a reminder message can't be saved, or null. Plain words only: no
 * link of any kind (a link in a garage's message to a Detlio customer would
 * be a way round Detlio, and WhatsApp marks links in a business's first
 * message as spam).
 */
export function messageRefusal(message: string): string | null {
  const text = message.trim()
  if (text.length === 0) return 'Write the message first.'
  if (text.length > GARAGE_BOOK_LIMITS.messageMax) {
    return `Keep the message under ${GARAGE_BOOK_LIMITS.messageMax} letters.`
  }
  if (hasLink(text)) return 'The message can’t have a link. Write your phone number instead.'
  return null
}

const LINK = /(https?:\/\/|www\.|wa\.me|\b[a-z0-9-]+\.(com|in|net|org|co|io|app|link|ly|me|biz|info|xyz|site|shop)\b)/i

export function hasLink(text: string): boolean {
  return LINK.test(text)
}

/** The message for one customer: {name}, {car}, {garage}, {phone} filled in, the rest left as typed. */
export function fillReminder(
  template: string,
  values: { name: string; car: string | null; garage: string; phone: string | null }
): string {
  const firstName = values.name.trim().split(/\s+/)[0] ?? ''
  return template
    .replaceAll('{name}', firstName || 'there')
    .replaceAll('{car}', values.car?.trim() || 'car')
    .replaceAll('{garage}', values.garage.trim())
    .replaceAll('{phone}', values.phone?.trim() || '')
    .replace(/\s+([.,!?])/g, '$1')
    .replace(/ {2,}/g, ' ')
    .trim()
}

/**
 * A number plate written the way Indian plates are laid out: "tn07cd9036"
 * reads "TN 07 CD 9036". The same as packages/core/src/moments.ts
 * formatIndianPlate (garage-book.parity.test.ts).
 */
export function formatIndianPlate(plate: string): string {
  const typed = plate.trim().toUpperCase().replace(/\s+/g, ' ')
  const compact = typed.replace(/[^A-Z0-9]/g, '')
  const bharat = compact.match(/^(\d{2})BH(\d{4})([A-Z]{1,2})$/)
  if (bharat) return `${bharat[1]} BH ${bharat[2]} ${bharat[3]}`
  const state = compact.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/)
  if (state) {
    const [, code, district, series, number] = state
    return [code, district!.padStart(2, '0'), series, number!.padStart(4, '0')].filter(Boolean).join(' ')
  }
  return typed
}

/** A plate as a search key: letters and digits only. */
export function plateKey(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** "own:<uuid>" or "detlio:<uuid>", the two kinds of customer one list holds. */
export type CustomerRef = { kind: 'own'; id: string } | { kind: 'detlio'; id: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseCustomerRef(ref: string): CustomerRef | null {
  const [kind, id, ...rest] = ref.split(':')
  if (rest.length > 0 || !id || !UUID.test(id)) return null
  if (kind === 'own') return { kind: 'own', id: id.toLowerCase() }
  if (kind === 'detlio') return { kind: 'detlio', id: id.toLowerCase() }
  return null
}

export function customerRef(ref: CustomerRef): string {
  return `${ref.kind}:${ref.id}`
}

export type DueState = 'none' | 'ok' | 'due_soon' | 'due_today' | 'overdue'

/**
 * When a car is next due, from its last visit: the IST date and how it
 * stands today. No visit, or no interval (the job's reminder was off), is
 * 'none'. A reminder sent since that visit makes it 'ok' again until the
 * next visit: the garage has done what the list asks.
 */
export function dueFor(input: {
  lastVisitAt: Date | null
  intervalDays: number | null
  remindedAt: Date | null
  now: Date
}): { dueOn: string | null; daysSince: number | null; state: DueState } {
  if (!input.lastVisitAt) return { dueOn: null, daysSince: null, state: 'none' }
  const today = istDateKey(input.now)
  const visited = istDateKey(input.lastVisitAt)
  const daysSince = Math.max(0, daysBetween(visited, today))
  if (!input.intervalDays) return { dueOn: null, daysSince, state: 'none' }
  const dueOn = addDays(visited, input.intervalDays)
  if (input.remindedAt && input.remindedAt.getTime() >= input.lastVisitAt.getTime()) {
    return { dueOn, daysSince, state: 'ok' }
  }
  const left = daysBetween(today, dueOn)
  const state: DueState = left < 0 ? 'overdue' : left === 0 ? 'due_today' : left <= 2 ? 'due_soon' : 'ok'
  return { dueOn, daysSince, state }
}

/** Whether a customer belongs on today's Remind list. */
export function isDue(state: DueState): boolean {
  return state === 'due_today' || state === 'overdue'
}

/**
 * Whether a Detlio push may go now, and when the next one may: one per
 * customer per garage every DETLIO_PUSH_EVERY_DAYS.
 */
export function pushAllowed(lastSentAt: Date | null, now: Date): { ok: boolean; nextAt: Date | null } {
  if (!lastSentAt) return { ok: true, nextAt: null }
  const nextAt = new Date(lastSentAt.getTime() + DETLIO_PUSH_EVERY_DAYS * 24 * 60 * 60 * 1000)
  return nextAt.getTime() <= now.getTime() ? { ok: true, nextAt: null } : { ok: false, nextAt }
}

/** Whole paise from a decimal rupee string ("499.00"). */
export function rupeesToPaise(amount: string | number | null | undefined): number {
  if (amount === null || amount === undefined) return 0
  const value = typeof amount === 'number' ? amount : Number(amount)
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}

/** "2026-11" → its first instant and the next month's, in IST. */
export function monthBounds(month: string): { start: Date; end: Date; days: number } | null {
  const match = month.match(/^(\d{4})-(0[1-9]|1[0-2])$/)
  if (!match) return null
  const year = Number(match[1])
  const m = Number(match[2])
  const start = new Date(`${match[1]}-${match[2]}-01T00:00:00+05:30`)
  const nextYear = m === 12 ? year + 1 : year
  const nextMonth = m === 12 ? 1 : m + 1
  const end = new Date(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+05:30`)
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  return { start, end, days }
}

/** The IST month a moment falls in, "YYYY-MM". */
export function istMonth(date: Date): string {
  return istDateKey(date).slice(0, 7)
}

/** The month before, "YYYY-MM". */
export function previousMonth(month: string): string {
  const [year, m] = month.split('-').map(Number) as [number, number]
  return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, '0')}`
}

/** A day's bounds in IST, "YYYY-MM-DD". */
export function dayBounds(dateKey: string): { start: Date; end: Date } {
  const start = new Date(`${dateKey}T00:00:00+05:30`)
  return { start, end: new Date(start.getTime() + 86_400_000) }
}

/** The share that changed, rounded to a whole percent; null with nothing to compare with. */
export function percentChange(now: number, before: number): number | null {
  if (before <= 0) return null
  return Math.round(((now - before) / before) * 100)
}
