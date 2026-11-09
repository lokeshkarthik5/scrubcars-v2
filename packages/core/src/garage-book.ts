/**
 * Garage Book for the garage apps (web portal and native app): the rules
 * the server holds (apps/server/src/lib/garage-book.ts, kept in step by its
 * parity test) and the words and figures both apps show, so the two read
 * exactly the same. Pure, with the clock passed in.
 */
import { formatINR } from './format'
import { formatIndianPlate } from './moments'

// ─── Rules shared with the server (garage-book.parity.test.ts) ────────────────

export const GARAGE_BOOK_LIMITS = {
  nameMax: 120,
  noteMax: 500,
  messageMax: 500,
  linesMax: 20,
  carsMax: 10,
  linePriceMaxRupees: 200_000,
  listMax: 500,
  pastDays: 31,
  futureDays: 90,
} as const

export const DEFAULT_REMINDER_MESSAGE =
  'Hi {name}, your {car} is due for its wash at {garage}. Reply here or call {phone} to book a time.'

export const DEFAULT_INTERVAL_DAYS = 30

export const DETLIO_PUSH_EVERY_DAYS = 7

export type JobStatus = 'booked' | 'in_progress' | 'done' | 'cancelled'
export type JobPayment = 'upi' | 'cash' | 'later'
export type BookFilter = 'all' | 'detlio' | 'own'

const NEXT: Record<JobStatus, readonly JobStatus[]> = {
  booked: ['in_progress', 'done', 'cancelled'],
  in_progress: ['done', 'cancelled', 'booked'],
  done: [],
  cancelled: [],
}

export function canMoveJob(from: JobStatus, to: JobStatus): boolean {
  return from === to || NEXT[from].includes(to)
}

const LINK = /(https?:\/\/|www\.|wa\.me|\b[a-z0-9-]+\.(com|in|net|org|co|io|app|link|ly|me|biz|info|xyz|site|shop)\b)/i

export function hasLink(text: string): boolean {
  return LINK.test(text)
}

export function messageRefusal(message: string): string | null {
  const text = message.trim()
  if (text.length === 0) return 'Write the message first.'
  if (text.length > GARAGE_BOOK_LIMITS.messageMax) {
    return `Keep the message under ${GARAGE_BOOK_LIMITS.messageMax} letters.`
  }
  if (hasLink(text)) return 'The message can’t have a link. Write your phone number instead.'
  return null
}

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

export function plateKey(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// ─── Figures and words both apps show ─────────────────────────────────────────

/** "₹1,398" from paise. Undefined (staff, who see no money) gives null: show nothing. */
export function rupees(paise: number | null | undefined): string | null {
  if (paise === null || paise === undefined || !Number.isFinite(paise)) return null
  return formatINR(paise / 100)
}

/** "₹3.2k", "₹1.8L": a figure small enough for a tile's quiet line. */
export function rupeesShort(paise: number): string {
  const value = paise / 100
  if (value >= 100_000) return `₹${trim1(value / 100_000)}L`
  if (value >= 1_000) return `₹${trim1(value / 1_000)}k`
  return formatINR(value)
}

function trim1(value: number): string {
  return (Math.round(value * 10) / 10).toString()
}

/** "9:30", "2:00": a job's start in IST, as the Today list writes it (no am/pm). */
export function jobTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const ist = new Date(date.getTime() + 330 * 60_000)
  const hours = ist.getUTCHours() % 12 || 12
  return `${hours}:${String(ist.getUTCMinutes()).padStart(2, '0')}`
}

/** "1st", "2nd", "7th": a visit's number. */
export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`
}

/** "YYYY-MM-DD" in IST. */
export function istDateKey(date: Date): string {
  return new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 10)
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function partsOf(dateKey: string) {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number]
  const utc = new Date(Date.UTC(y, m - 1, d))
  return { y, m, d, dow: utc.getUTCDay() }
}

export function addDays(dateKey: string, days: number): string {
  const { y, m, d } = partsOf(dateKey)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** "Sun 9 Nov". */
export function dayLabel(dateKey: string): string {
  const { m, d, dow } = partsOf(dateKey)
  return `${WEEKDAY[dow]} ${d} ${MONTH[m - 1]}`
}

/** "8 Oct". */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const { m, d } = partsOf(istDateKey(new Date(iso)))
  return `${d} ${MONTH[m - 1]}`
}

/** "Mar 2026". */
export function monthYear(iso: string): string {
  const { y, m } = partsOf(istDateKey(new Date(iso)))
  return `${MONTH[m - 1]} ${y}`
}

/** "November" for "2026-11"; with the year when it isn't this one. */
export function monthName(month: string, now: Date): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const name = MONTH_LONG[m - 1] ?? month
  return String(y) === istDateKey(now).slice(0, 4) ? name : `${name} ${y}`
}

/** The last twelve months, newest first, "YYYY-MM". */
export function recentMonths(now: Date, count = 12): string[] {
  const [y, m] = istDateKey(now).split('-').map(Number) as [number, number]
  return Array.from({ length: count }, (_, i) => {
    const index = (y * 12 + (m - 1)) - i
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
  })
}

/** The Jobs day strip: yesterday, today and the next four days. */
export function dayStrip(today: string): Array<{ key: string; weekday: string; day: number }> {
  return Array.from({ length: 6 }, (_, i) => {
    const key = addDays(today, i - 1)
    const { d, dow } = partsOf(key)
    return { key, weekday: WEEKDAY[dow]!, day: d }
  })
}

/** The busiest days' letters, Monday first, as Stats draws them. */
export const WEEK_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const

/** Which bar of the busiest days is lit: the biggest, or none when all are empty. */
export function busiestIndex(counts: number[]): number | null {
  const max = Math.max(0, ...counts)
  return max > 0 ? counts.indexOf(max) : null
}

/** A car as one line: "Hyundai Creta". */
export function carName(car: { make?: string | null; model?: string | null } | null | undefined): string {
  if (!car) return ''
  return [car.make, car.model].filter(Boolean).join(' ').trim()
}

/** A plate written as plates are, or null for none. */
export function plateText(plate: string | null | undefined): string | null {
  const text = plate?.trim()
  return text ? formatIndianPlate(text) : null
}

/** Two letters for a customer's disc: "SK". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? `${parts[0]![0]}${parts[parts.length - 1]![0]}` : (parts[0]?.slice(0, 2) ?? '')
  return letters.toUpperCase()
}

/** A walk-in's id, made on the phone, so a resend after no signal is the same job. */
export function newClientId(now: number = Date.now(), random: () => number = Math.random): string {
  const bits = Array.from({ length: 4 }, () => Math.floor(random() * 0x100000000).toString(36)).join('')
  return `wi-${now.toString(36)}-${bits}`.slice(0, 64)
}

export type WhenChoice = 'now' | 'later' | 'pick'

/**
 * When a walk-in starts: Now (this minute, and the job is under way), Later
 * today (the next whole hour), or a picked time (an "HH:MM" today, or a full
 * date and time).
 */
export function walkInTime(choice: WhenChoice, now: Date, picked?: string | null): { scheduledAt: string; status: 'booked' | 'in_progress' } {
  if (choice === 'now') return { scheduledAt: now.toISOString(), status: 'in_progress' }
  if (choice === 'pick' && picked) {
    const iso = /^\d{2}:\d{2}$/.test(picked) ? `${istDateKey(now)}T${picked}:00+05:30` : picked
    const date = new Date(iso)
    if (!Number.isNaN(date.getTime())) return { scheduledAt: date.toISOString(), status: 'booked' }
  }
  // The next whole hour on India's clock (IST is UTC+5:30, so not UTC's).
  const ist = new Date(now.getTime() + 330 * 60_000)
  ist.setUTCMinutes(0, 0, 0)
  const next = new Date(ist.getTime() + 60 * 60_000 - 330 * 60_000)
  return { scheduledAt: next.toISOString(), status: 'booked' }
}

/** "In 30 days · 9 Dec": when a walk-in's reminder would be due. */
export function remindLine(days: number, now: Date): string {
  const key = addDays(istDateKey(now), days)
  const { m, d } = partsOf(key)
  return `In ${days} days · ${d} ${MONTH[m - 1]}`
}

/** The tone a job's status line is drawn in. */
export type StatusTone = 'done' | 'working' | 'owed' | 'quiet'

/** Under a job: "In progress · 7th visit", "Done · UPI", "Pay later · adds to ₹6,400 owed". */
export function ownJobStatus(job: {
  status: JobStatus
  payment: JobPayment
  visitNumber?: number
  totalPaise?: number
}): { text: string; tone: StatusTone } | null {
  const pay = job.payment === 'later' ? 'Pay later' : job.payment.toUpperCase()
  if (job.status === 'done') {
    if (job.payment === 'later') {
      const amount = rupees(job.totalPaise)
      return { text: amount ? `Done · ${amount} owed` : 'Done · Pay later', tone: 'owed' }
    }
    return { text: `Done · ${pay}`, tone: 'done' }
  }
  if (job.status === 'in_progress') {
    const visit = job.visitNumber && job.visitNumber > 1 ? ` · ${ordinal(job.visitNumber)} visit` : ` · ${pay}`
    return { text: `In progress${visit}`, tone: 'working' }
  }
  if (job.payment === 'later') return { text: 'Pay later · adds to money owed', tone: 'owed' }
  return null
}

/** Under a Detlio job, from its booking status. */
export function detlioJobStatus(job: { status: string; paymentMethod: string; amount?: string }): { text: string; tone: StatusTone } | null {
  const amount = job.amount ? formatINR(Number(job.amount)) : null
  if (job.status === 'completed') {
    return { text: amount ? `Done · ${amount} ${job.paymentMethod === 'online' ? 'paid online' : 'cash'}` : 'Done', tone: 'done' }
  }
  if (job.status === 'in_progress') return { text: 'In progress', tone: 'working' }
  if (job.status === 'pending') return { text: 'Waiting for your answer', tone: 'owed' }
  return null
}

/** Whether a job is finished: walk-in done, or Detlio completed. */
export function isFinished(job: { source: 'own' | 'detlio'; status: string }): boolean {
  return job.source === 'own' ? job.status === 'done' : job.status === 'completed'
}

/**
 * The closing-time card (moment 4): on Home once the day's last job has
 * started and every job is finished. Today only.
 */
export function showClosingCard(day: { date: string; allDone: boolean; lastStartsAt: string | null }, now: Date): boolean {
  if (!day.allDone || !day.lastStartsAt) return false
  if (day.date !== istDateKey(now)) return false
  return now.getTime() >= new Date(day.lastStartsAt).getTime()
}

/** A reminder's reason line: "Wash · 30 days since 8 Oct", "Wash · 21 days · Detlio sends it". */
export function reminderReason(entry: {
  source: 'own' | 'detlio'
  daysSince: number | null
  lastVisitAt: string | null
  sentAt: string | null
}): string {
  if (entry.sentAt) return `Wash · sent ${formatTimeShort(entry.sentAt)}`
  const days = entry.daysSince === null ? '' : ` · ${entry.daysSince} days`
  if (entry.source === 'detlio') return `Wash${days} · Detlio sends it`
  return entry.lastVisitAt ? `Wash${days} since ${shortDate(entry.lastVisitAt)}` : `Wash${days}`
}

function formatTimeShort(iso: string): string {
  const ist = new Date(new Date(iso).getTime() + 330 * 60_000)
  const hours = ist.getUTCHours()
  return `${hours % 12 || 12}:${String(ist.getUTCMinutes()).padStart(2, '0')} ${hours < 12 ? 'am' : 'pm'}`
}

/** A customer row's right-hand word: "Due today", "Via Detlio", "₹6,400 owed", "Last 4 Aug". */
export function customerTag(row: {
  viaDetlio: boolean
  due: { state: string }
  owesPaise?: number
  lastVisitAt: string | null
}): { text: string; tone: 'due' | 'owed' | 'quiet' } {
  if (row.due.state === 'due_today' || row.due.state === 'overdue') return { text: 'Due today', tone: 'due' }
  if (row.owesPaise && row.owesPaise > 0) return { text: `${rupees(row.owesPaise)} owed`, tone: 'owed' }
  if (row.viaDetlio) return { text: 'Via Detlio', tone: 'quiet' }
  if (row.due.state === 'due_soon') return { text: 'Due soon', tone: 'due' }
  return { text: row.lastVisitAt ? `Last ${shortDate(row.lastVisitAt)}` : 'New', tone: 'quiet' }
}

/** "Due in 2 days.", "Due today.", "3 days late." and "Every 30 days" under a car's gauge. */
export function washWords(wash: { daysSinceWash: number | null; intervalDays: number; dueOn: string | null; dueState: string }, now: Date) {
  const every = `Every ${wash.intervalDays} days`
  if (wash.daysSinceWash === null || !wash.dueOn) return { lead: 'No visit yet.', rest: ` ${every}` }
  const today = istDateKey(now)
  const left = Math.round((Date.parse(`${wash.dueOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  const lead = left > 1 ? `Due in ${left} days.` : left === 1 ? 'Due tomorrow.' : left === 0 ? 'Due today.' : `${-left} days late.`
  return { lead, rest: ` ${every}` }
}

/** The friendly WhatsApp for money owed: no link, just the amount and thanks. */
export function owedMessage(values: { name: string; garage: string; amountPaise: number }): string {
  const first = values.name.trim().split(/\s+/)[0] || 'there'
  return `Hi ${first}, a friendly reminder from ${values.garage}: ${rupees(values.amountPaise)} is pending for your car's service. You can pay by UPI or cash. Thank you!`
}

/** "3 customers · oldest from 1 Nov". */
export function owedSummary(count: number, oldestAt: string | null): string {
  const people = `${count} ${count === 1 ? 'customer' : 'customers'}`
  return oldestAt ? `${people} · oldest from ${shortDate(oldestAt)}` : people
}
