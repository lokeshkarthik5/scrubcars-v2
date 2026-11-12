/**
 * Garage Book's rules (0072, modules/garage-book; SPEC.md in the owner's
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

// ─── Stages 2 and 3 (0073; screens OK'd 12 Nov 2026) ─────────────────────────
//
// Owner decisions these carry:
//
//   - Team members are names only, with no login. Only the owner sees money:
//     staff see jobs, stock levels and "Count it", never a price.
//   - Bills carry the garage's own running number from 0001, never reused,
//     and always say "Made with Detlio for Garages".
//   - The garage's UPI QR and phone go on its bills, money-owed reminders and
//     booking page only where it says so; the money goes straight to it.
//   - The booking link is free and for the garage's own customers: a phone
//     that has booked this garage through Detlio books on Detlio (decision 5).
//   - Low stock is calm amber in the apps, never a red glow.

export const GARAGE_BOOK_2_LIMITS = {
  teamMax: 50,
  roleMax: 60,
  expenseNoteMax: 200,
  /** One expense, in rupees, at most. */
  expenseMaxRupees: 1_000_000,
  stockItemsMax: 200,
  suppliersMax: 50,
  orderLinesMax: 30,
  importRowsMax: 500,
  importPhotosMax: 5,
  /** A stock amount (level, low mark, pack, use), in the item's unit, at most. */
  stockAmountMax: 1_000_000,
  /** How many days of times the booking page offers. */
  linkDays: 3,
  /** Link bookings one phone may make at one garage in a day. */
  linkBookingsPerPhonePerDay: 3,
  /** A job this many days after a reminder "came back after a reminder". */
  reminderPaidBackDays: 30,
  /** Months an "every month" expense is copied forward at most in one read. */
  repeatMonthsMax: 24,
} as const

export const EXPENSE_CATEGORIES = ['salary', 'advance', 'rent', 'supplies', 'power_water', 'other'] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export const EXPENSE_METHODS = ['cash', 'upi', 'bank'] as const
export type ExpenseMethod = (typeof EXPENSE_METHODS)[number]

export const PAY_APPS = ['gpay', 'phonepe', 'paytm'] as const
export type PayApp = (typeof PAY_APPS)[number]

export const STOCK_UNITS = ['ml', 'l', 'g', 'kg', 'pcs'] as const
export type StockUnit = (typeof STOCK_UNITS)[number]

export const JOB_ORIGINS = ['walk_in', 'link', 'import'] as const
export type JobOrigin = (typeof JOB_ORIGINS)[number]

/** What every bill says at its foot. There is no setting to hide it. */
export const MADE_WITH = 'Made with Detlio for Garages'

/** "0142": a bill number as the bill prints it, four digits at least. */
export function billNumberText(number: number): string {
  return String(Math.max(0, Math.trunc(number))).padStart(4, '0')
}

/**
 * The booking page's address from the garage's name: "Sample Car Care" →
 * "sample-car-care". Letters and digits joined by single hyphens, 3–50
 * long; a name with too little in it becomes "garage".
 */
export function slugFor(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '')
  return slug.length >= 3 ? slug : 'garage'
}

/** The slug to try after a clash: "sample-car-care-2", "-3", … */
export function slugWithSuffix(base: string, attempt: number): string {
  return attempt <= 1 ? base : `${base.slice(0, 50)}-${attempt}`
}

/**
 * A job as the apps name it: "own:<uuid>" (a walk-in), "detlio:<uuid>" (a
 * Detlio booking), or a bare id, which the service looks up as either.
 */
export type JobRef = { kind: 'own' | 'detlio' | 'any'; id: string }

export function parseJobRef(ref: string): JobRef | null {
  const parts = ref.split(':')
  if (parts.length === 1) return UUID.test(parts[0]!) ? { kind: 'any', id: parts[0]!.toLowerCase() } : null
  const [kind, id, ...rest] = parts
  if (rest.length > 0 || !id || !UUID.test(id)) return null
  if (kind === 'own' || kind === 'detlio') return { kind, id: id.toLowerCase() }
  return null
}

/**
 * What a payment QR says. A UPI QR is `upi://pay?pa=<id>&pn=<name>…`; any
 * other text (a website, a contact card) is `not_upi` and refused, so a
 * garage can't put something else on its bills. A UPI link with no payee is
 * `not_upi` too.
 */
export function parseUpiUri(text: string): { upiId: string; upiName: string | null } | 'not_upi' {
  const trimmed = text.trim()
  if (!/^upi:\/\//i.test(trimmed)) return 'not_upi'
  const query = trimmed.split('?')[1] ?? ''
  const params = new URLSearchParams(query)
  const pa = params.get('pa')?.trim() ?? ''
  if (!/^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$/.test(pa)) return 'not_upi'
  const pn = params.get('pn')?.trim().replace(/\s+/g, ' ') ?? ''
  return { upiId: pa.slice(0, 100), upiName: pn ? pn.slice(0, 120) : null }
}

const APP_NAMES: Record<PayApp, string> = { gpay: 'GPay', phonepe: 'PhonePe', paytm: 'Paytm' }

/** "GPay/PhonePe": the apps a payment phone takes, in a fixed order. */
export function payAppsText(apps: readonly string[]): string {
  return PAY_APPS.filter((app) => apps.includes(app))
    .map((app) => APP_NAMES[app])
    .join('/')
}

/** "98400 00000". */
export function spacedPhone(phone: string): string {
  return phone.length === 10 ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone
}

/**
 * The line a reminder or a bill's WhatsApp carries when the garage shows its
 * payment details: "Pay on GPay/PhonePe 98400 00000", or "Pay by UPI on
 * 98400 00000" with no app ticked. Null with no phone.
 */
export function payLine(details: { phone: string | null; apps: readonly string[] }): string | null {
  if (!details.phone) return null
  const apps = payAppsText(details.apps)
  return apps ? `Pay on ${apps} ${spacedPhone(details.phone)}` : `Pay by UPI on ${spacedPhone(details.phone)}`
}

/** One day of the garage's weekly hours, as vendor_working_hours keeps it. */
export interface WeekHours {
  dayOfWeek: number
  openTime: string
  closeTime: string
  isClosed: boolean
}

/** The booking page's simple times: the first on the half hour after opening, then every 90 minutes. */
export const LINK_STEP_MINS = 90
/** Today's times start at least this long from now. */
export const LINK_LEAD_MINS = 60
/** The last start is at least this long before closing. */
export const LINK_LAST_BEFORE_CLOSE_MINS = 60

function minutesOf(time: string): number | null {
  const match = time.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function istWeekday(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay()
}

function istInstant(dateKey: string, minutes: number): Date {
  return new Date(new Date(`${dateKey}T00:00:00+05:30`).getTime() + minutes * 60_000)
}

/**
 * Whether the garage is open at `now` (IST): today's hours, not a closed
 * day. Walk-ins and link bookings never change Detlio slots (decision 3), so
 * this reads the hours alone.
 */
export function openNow(hours: readonly WeekHours[], closures: ReadonlySet<string>, now: Date): boolean {
  const today = istDateKey(now)
  if (closures.has(today)) return false
  const day = hours.find((row) => row.dayOfWeek === istWeekday(today))
  if (!day || day.isClosed) return false
  const open = minutesOf(day.openTime)
  const close = minutesOf(day.closeTime)
  if (open === null || close === null) return false
  const minute = Math.floor((now.getTime() - new Date(`${today}T00:00:00+05:30`).getTime()) / 60_000)
  return minute >= open && minute < close
}

/**
 * The times the booking page offers: the next `days` open days (looking a
 * week ahead), each from opening on the half hour, every LINK_STEP_MINS,
 * the last at least LINK_LAST_BEFORE_CLOSE_MINS before closing; today's
 * only from LINK_LEAD_MINS after now. A plain list from opening hours: the
 * garage confirms on WhatsApp.
 */
export function linkTimes(
  hours: readonly WeekHours[],
  closures: ReadonlySet<string>,
  now: Date,
  days: number = GARAGE_BOOK_2_LIMITS.linkDays
): Array<{ date: string; times: string[] }> {
  const out: Array<{ date: string; times: string[] }> = []
  const today = istDateKey(now)
  for (let offset = 0; offset < 7 && out.length < days; offset++) {
    const date = addDays(today, offset)
    if (closures.has(date)) continue
    const day = hours.find((row) => row.dayOfWeek === istWeekday(date))
    if (!day || day.isClosed) continue
    const open = minutesOf(day.openTime)
    const close = minutesOf(day.closeTime)
    if (open === null || close === null || close <= open) continue
    const times: string[] = []
    for (let minute = Math.ceil(open / 30) * 30; minute + LINK_LAST_BEFORE_CLOSE_MINS <= close; minute += LINK_STEP_MINS) {
      const at = istInstant(date, minute)
      if (at.getTime() < now.getTime() + LINK_LEAD_MINS * 60_000) continue
      times.push(at.toISOString())
    }
    if (times.length > 0) out.push({ date, times })
  }
  return out
}

/** Whether an item is running low: at or under its low mark (a mark of 0 never is). */
export function isLow(level: number, lowAt: number): boolean {
  return lowAt > 0 && level <= lowAt
}

/**
 * How full the dial reads, 0–1: the level against one pack (a 5 L can at
 * 0.6 L reads 0.12), or against four low marks with no pack size.
 */
export function stockShare(level: number, packSize: number | null, lowAt: number): number {
  const full = packSize && packSize > 0 ? packSize : lowAt > 0 ? lowAt * 4 : level
  if (!full || full <= 0) return level > 0 ? 1 : 0
  return Math.max(0, Math.min(1, Math.round((level / full) * 100) / 100))
}

/** "About 6 washes": whole jobs the level still covers at `perJob` each; null when nothing uses it. */
export function jobsLeft(level: number, perJob: number | null): number | null {
  if (!perJob || perJob <= 0) return null
  return Math.max(0, Math.floor(level / perJob + 1e-9))
}

/** Packs to order for a low item: enough to reach twice the low mark, one at least. */
export function suggestPacks(level: number, lowAt: number, packSize: number | null): number {
  if (!packSize || packSize <= 0) return 1
  const want = Math.max(lowAt * 2, packSize) - level
  return Math.max(1, Math.ceil(want / packSize - 1e-9))
}

/** A stock amount kept to three decimals, as numeric(12, 3) holds it. */
export function stockAmount(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** The month after, "YYYY-MM". */
export function nextMonth(month: string): string {
  const [year, m] = month.split('-').map(Number) as [number, number]
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, '0')}`
}

/** The same day of the month in another month, kept inside it: the 31st in February is the 28th or 29th. */
export function sameDayIn(month: string, dateKey: string): string {
  const day = Number(dateKey.slice(8, 10))
  const bounds = monthBounds(month)
  const last = bounds ? bounds.days : 28
  return `${month}-${String(Math.min(day, last)).padStart(2, '0')}`
}

// ─── Milestones (moment 6) ───────────────────────────────────────────────────

/** Own customers in the book: 100, then each of these. */
export const CUSTOMER_MILESTONES = [100, 250, 500, 1000] as const
/** A month's whole-garage takings, in lakh rupees. */
export const LAKH_MONTH_MILESTONES = [1, 2, 5, 10] as const

export type Milestone =
  | { key: string; kind: 'customers'; value: number; next: { kind: 'customers' | 'lakh_month'; value: number } | null }
  | { key: string; kind: 'lakh_month'; value: number; month: string; next: { kind: 'lakh_month'; value: number } | null }
  | { key: string; kind: 'best_month'; month: string; takenPaise: number; previousBestPaise: number; next: null }

/**
 * The milestone to show, or null: the first one reached that hasn't been
 * seen, customers first, then a lakh month, then a best month ever. Each
 * key shows once. A best month counts once the garage has two earlier
 * months with takings to beat.
 */
export function milestoneFor(input: {
  ownCustomers: number
  /** Whole-garage takings per IST month, any order. */
  months: ReadonlyArray<{ month: string; paise: number }>
  currentMonth: string
  seen: ReadonlySet<string>
}): Milestone | null {
  const reachedCustomers = CUSTOMER_MILESTONES.filter((n) => input.ownCustomers >= n)
  const topCustomers = reachedCustomers.at(-1)
  if (topCustomers !== undefined && !input.seen.has(`customers_${topCustomers}`)) {
    const nextCustomers = CUSTOMER_MILESTONES.find((n) => n > topCustomers)
    return {
      key: `customers_${topCustomers}`,
      kind: 'customers',
      value: topCustomers,
      next: nextCustomers ? { kind: 'customers', value: nextCustomers } : null,
    }
  }
  const best = input.months.reduce((max, row) => Math.max(max, row.paise), 0)
  const reachedLakh = LAKH_MONTH_MILESTONES.filter((n) => best >= n * 100_000 * 100)
  const topLakh = reachedLakh.at(-1)
  if (topLakh !== undefined && !input.seen.has(`lakh_month_${topLakh}`)) {
    const month = input.months
      .filter((row) => row.paise >= topLakh * 100_000 * 100)
      .map((row) => row.month)
      .sort()[0]!
    const nextLakh = LAKH_MONTH_MILESTONES.find((n) => n > topLakh)
    return {
      key: `lakh_month_${topLakh}`,
      kind: 'lakh_month',
      value: topLakh,
      month,
      next: nextLakh ? { kind: 'lakh_month', value: nextLakh } : null,
    }
  }
  const current = input.months.find((row) => row.month === input.currentMonth)
  const earlier = input.months.filter((row) => row.month < input.currentMonth && row.paise > 0)
  if (current && earlier.length >= 2) {
    const previousBest = earlier.reduce((max, row) => Math.max(max, row.paise), 0)
    const key = `best_month_${input.currentMonth}`
    if (current.paise > previousBest && !input.seen.has(key)) {
      return { key, kind: 'best_month', month: input.currentMonth, takenPaise: current.paise, previousBestPaise: previousBest, next: null }
    }
  }
  return null
}

/** The keys a seen milestone also settles: a 500-customer card means the 100 and 250 ones need not show. */
export function milestoneKeysSettled(key: string): string[] {
  const customers = key.match(/^customers_(\d+)$/)
  if (customers) return CUSTOMER_MILESTONES.filter((n) => n <= Number(customers[1])).map((n) => `customers_${n}`)
  const lakh = key.match(/^lakh_month_(\d+)$/)
  if (lakh) return LAKH_MONTH_MILESTONES.filter((n) => n <= Number(lakh[1])).map((n) => `lakh_month_${n}`)
  return [key]
}

/** A key the apps may mark seen: one milestoneFor can give. */
export function isMilestoneKey(key: string): boolean {
  return (
    /^customers_(100|250|500|1000)$/.test(key) ||
    /^lakh_month_(1|2|5|10)$/.test(key) ||
    /^best_month_\d{4}-(0[1-9]|1[0-2])$/.test(key)
  )
}

/** "₹1,398", "₹1,46,100", "₹12.50": paise as a WhatsApp or a bill writes it. */
export function rupeesText(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

const UNIT_WORDS: Record<StockUnit, string> = { ml: 'ml', l: 'L', g: 'g', kg: 'kg', pcs: 'pcs' }

/** "600 ml", "5 L", "1.2 L" (from 1200 ml), "500 g", "1.5 kg", "10 pcs": an amount as the screens and orders write it. */
export function stockAmountText(amount: number, unit: StockUnit): string {
  const round = (value: number) => String(Math.round(value * 100) / 100)
  if (unit === 'ml' && Math.abs(amount) >= 1000) return `${round(amount / 1000)} L`
  if (unit === 'g' && Math.abs(amount) >= 1000) return `${round(amount / 1000)} kg`
  return `${round(amount)} ${UNIT_WORDS[unit]}`
}

/** Each expense category as the Excel download writes it. */
export const EXPENSE_CATEGORY_WORDS: Record<ExpenseCategory, string> = {
  salary: 'Salary',
  advance: 'Advance',
  rent: 'Rent',
  supplies: 'Supplies',
  power_water: 'Power & water',
  other: 'Other',
}
