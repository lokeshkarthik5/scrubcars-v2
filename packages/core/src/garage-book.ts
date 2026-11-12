/**
 * Garage Book for the garage apps (web portal and native app): the rules
 * the server holds (apps/server/src/lib/garage-book.ts, kept in step by its
 * parity test) and the words and figures both apps show, so the two read
 * exactly the same. Pure, with the clock passed in.
 */
import type { NoFeeInspectionJob } from './api/garage-book'
import { formatINR } from './format'
import { garageInspectionPrice } from './inspection-booking'
import { msg, t, tn } from './i18n/translate'
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
  if (text.length === 0) return t('Write the message first.')
  if (text.length > GARAGE_BOOK_LIMITS.messageMax) {
    return t('Keep the message under {max} letters.', { max: GARAGE_BOOK_LIMITS.messageMax })
  }
  if (hasLink(text)) return t('The message can’t have a link. Write your phone number instead.')
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
  return t('In {days} days · {date}', { days, date: `${d} ${MONTH[m - 1]}` })
}

/** How a walk-in is paid, as a job's line writes it: "UPI", "CASH", "Pay later". */
export function payWord(payment: JobPayment | (string & {})): string {
  if (payment === 'later') return t('Pay later')
  if (payment === 'cash') return t('CASH')
  return payment.toUpperCase()
}

const STATUS_WORDS: Readonly<Record<string, string>> = {
  booked: msg('booked'),
  'in progress': msg('in progress'),
  done: msg('done'),
  cancelled: msg('cancelled'),
  pending: msg('pending'),
  confirmed: msg('confirmed'),
  completed: msg('completed'),
}

/** A status as a customer's history writes it, lower case ("in progress"); a word it doesn't know shows as it is. */
export function statusWord(word: string): string {
  return Object.prototype.hasOwnProperty.call(STATUS_WORDS, word) ? t(STATUS_WORDS[word]!) : word
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
  const pay = payWord(job.payment)
  if (job.status === 'done') {
    if (job.payment === 'later') {
      const amount = rupees(job.totalPaise)
      return { text: amount ? t('Done · {amount} owed', { amount }) : t('Done · Pay later'), tone: 'owed' }
    }
    return { text: t('Done · {pay}', { pay }), tone: 'done' }
  }
  if (job.status === 'in_progress') {
    const text =
      job.visitNumber && job.visitNumber > 1
        ? t('In progress · {nth} visit', { nth: ordinal(job.visitNumber) })
        : t('In progress · {pay}', { pay })
    return { text, tone: 'working' }
  }
  if (job.payment === 'later') return { text: t('Pay later · adds to money owed'), tone: 'owed' }
  return null
}

/**
 * A no-fee inspection job's price while its bill is unpaid (0073): "Price on
 * inspection · bill not sent", or the bill's total once sent. Null once the
 * bill is paid (the job's amount is then the bill) and on any other job.
 */
export function unpaidInspectionPrice(noFeeInspection: NoFeeInspectionJob | null | undefined): string | null {
  if (!noFeeInspection || noFeeInspection.billPaid) return null
  const bill = noFeeInspection.billTotal === null ? null : { total: Number(noFeeInspection.billTotal), paid: false }
  return garageInspectionPrice(bill).text
}

/** Under a Detlio job, from its booking status. */
export function detlioJobStatus(job: {
  status: string
  paymentMethod: string
  amount?: string
  noFeeInspection?: NoFeeInspectionJob | null
}): { text: string; tone: StatusTone } | null {
  const inspection = unpaidInspectionPrice(job.noFeeInspection)
  if (job.status === 'completed' && inspection) {
    // Done, and its no-fee inspection's bill still to send or to be paid.
    return { text: t('Done · {price}', { price: inspection }), tone: 'owed' }
  }
  const amount = job.amount ? formatINR(Number(job.amount)) : null
  if (job.status === 'completed') {
    const text = !amount
      ? t('Done')
      : job.paymentMethod === 'online'
        ? t('Done · {amount} paid online', { amount })
        : t('Done · {amount} cash', { amount })
    return { text, tone: 'done' }
  }
  if (job.status === 'in_progress') return { text: t('In progress'), tone: 'working' }
  if (job.status === 'pending') return { text: t('Waiting for your answer'), tone: 'owed' }
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
  if (entry.sentAt) return t('Wash · sent {time}', { time: formatTimeShort(entry.sentAt) })
  const days = entry.daysSince
  if (entry.source === 'detlio') {
    return days === null ? t('Wash · Detlio sends it') : t('Wash · {days} days · Detlio sends it', { days })
  }
  if (entry.lastVisitAt) {
    const date = shortDate(entry.lastVisitAt)
    return days === null ? t('Wash since {date}', { date }) : t('Wash · {days} days since {date}', { days, date })
  }
  return days === null ? t('Wash') : t('Wash · {days} days', { days })
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
  if (row.due.state === 'due_today' || row.due.state === 'overdue') return { text: t('Due today'), tone: 'due' }
  if (row.owesPaise && row.owesPaise > 0) return { text: t('{amount} owed', { amount: rupees(row.owesPaise) ?? '' }), tone: 'owed' }
  if (row.viaDetlio) return { text: t('Via Detlio'), tone: 'quiet' }
  if (row.due.state === 'due_soon') return { text: t('Due soon'), tone: 'due' }
  return { text: row.lastVisitAt ? t('Last {date}', { date: shortDate(row.lastVisitAt) }) : t('New'), tone: 'quiet' }
}

/** "Due in 2 days.", "Due today.", "3 days late." and "Every 30 days" under a car's gauge. */
export function washWords(wash: { daysSinceWash: number | null; intervalDays: number; dueOn: string | null; dueState: string }, now: Date) {
  const every = t('Every {days} days', { days: wash.intervalDays })
  if (wash.daysSinceWash === null || !wash.dueOn) return { lead: t('No visit yet.'), rest: ` ${every}` }
  const today = istDateKey(now)
  const left = Math.round((Date.parse(`${wash.dueOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  const lead =
    left > 1
      ? t('Due in {days} days.', { days: left })
      : left === 1
        ? t('Due tomorrow.')
        : left === 0
          ? t('Due today.')
          : t('{days} days late.', { days: -left })
  return { lead, rest: ` ${every}` }
}

/**
 * The friendly WhatsApp for money owed: no link, just the amount and thanks.
 * Sent to the customer, so English. `payLine` (0074, GET /owed's) is the
 * garage's own "Pay on GPay 98400 00000", added when it shows it on reminders.
 */
export function owedMessage(values: { name: string; garage: string; amountPaise: number; payLine?: string | null }): string {
  const first = values.name.trim().split(/\s+/)[0] || 'there'
  const text = `Hi ${first}, a friendly reminder from ${values.garage}: ${rupees(values.amountPaise)} is pending for your car's service. You can pay by UPI or cash. Thank you!`
  return values.payLine ? `${text}\n${values.payLine}` : text
}

/** "3 customers · oldest from 1 Nov". */
export function owedSummary(count: number, oldestAt: string | null): string {
  const people = tn(count, '{count} customer', '{count} customers')
  return oldestAt ? t('{people} · oldest from {date}', { people, date: shortDate(oldestAt) }) : people
}

// ─── Stages 2 and 3 (0074): rules shared with the server (parity test) ────────

export const GARAGE_BOOK_2_LIMITS = {
  teamMax: 50,
  roleMax: 60,
  expenseNoteMax: 200,
  expenseMaxRupees: 1_000_000,
  stockItemsMax: 200,
  suppliersMax: 50,
  orderLinesMax: 30,
  importRowsMax: 500,
  importPhotosMax: 5,
  stockAmountMax: 1_000_000,
  linkDays: 3,
  linkBookingsPerPhonePerDay: 3,
  reminderPaidBackDays: 30,
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

export type JobOrigin = 'walk_in' | 'link' | 'import'

/** What every bill says at its foot. There is no setting to hide it. */
export const MADE_WITH = 'Made with Detlio for Garages'

/** "0142": a bill number as the bill prints it. */
export function billNumberText(number: number): string {
  return String(Math.max(0, Math.trunc(number))).padStart(4, '0')
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

/** "Pay on GPay/PhonePe 98400 00000": sent to the customer, so English, as the server writes it. */
export function payLine(details: { phone: string | null; apps: readonly string[] }): string | null {
  if (!details.phone) return null
  const apps = payAppsText(details.apps)
  return apps ? `Pay on ${apps} ${spacedPhone(details.phone)}` : `Pay by UPI on ${spacedPhone(details.phone)}`
}

/** Whether an item is running low: at or under its low mark (a mark of 0 never is). Calm amber, never a glow. */
export function isLow(level: number, lowAt: number): boolean {
  return lowAt > 0 && level <= lowAt
}

/** How full the stock dial reads, 0–1: the level against one pack, or four low marks with no pack size. */
export function stockShare(level: number, packSize: number | null, lowAt: number): number {
  const full = packSize && packSize > 0 ? packSize : lowAt > 0 ? lowAt * 4 : level
  if (!full || full <= 0) return level > 0 ? 1 : 0
  return Math.max(0, Math.min(1, Math.round((level / full) * 100) / 100))
}

/** Whole jobs the level still covers at `perJob` each; null when nothing uses it. */
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

const UNIT_WORDS: Record<StockUnit, string> = { ml: 'ml', l: 'L', g: 'g', kg: 'kg', pcs: 'pcs' }

/** "600 ml", "5 L", "1.2 L" (from 1200 ml), "1.5 kg", "10 pcs". */
export function stockAmountText(amount: number, unit: StockUnit): string {
  const round = (value: number) => String(Math.round(value * 100) / 100)
  if (unit === 'ml' && Math.abs(amount) >= 1000) return `${round(amount / 1000)} L`
  if (unit === 'g' && Math.abs(amount) >= 1000) return `${round(amount / 1000)} kg`
  return `${round(amount)} ${UNIT_WORDS[unit]}`
}

// ─── Stages 2 and 3: words both apps show ─────────────────────────────────────

/** "Salaries", "Rent", "Power & water": an expense category on the Expenses screen. */
export function expenseCategoryWord(category: ExpenseCategory): string {
  switch (category) {
    case 'salary':
      return t('Salaries')
    case 'advance':
      return t('Advance')
    case 'rent':
      return t('Rent')
    case 'supplies':
      return t('Supplies')
    case 'power_water':
      return t('Power & water')
    default:
      return t('Other')
  }
}

/** "Received 2 cans", "Counted", "Used on a job": a stock history line's word. */
export function stockMoveWord(kind: 'used' | 'counted' | 'received' | 'manual'): string {
  switch (kind) {
    case 'used':
      return t('Used on a job')
    case 'counted':
      return t('Counted')
    case 'received':
      return t('Received')
    default:
      return t('Added')
  }
}

/** "+10 L", "−300 ml": a stock move's change. */
export function stockDeltaText(delta: number, unit: StockUnit): string {
  const text = stockAmountText(Math.abs(delta), unit)
  return delta < 0 ? `−${text}` : `+${text}`
}

/** "4 at work · Arun 6 jobs": the Team tile on Business. */
export function teamTileLine(team: { atWork: number; members: Array<{ name: string; jobsToday: number }> }): string {
  const busiest = team.members.slice().sort((a, b) => b.jobsToday - a.jobsToday)[0]
  const atWork = t('{count} at work', { count: team.atWork })
  if (!busiest || busiest.jobsToday === 0) return atWork
  return `${atWork} · ${tn(busiest.jobsToday, '{name} {count} job', '{name} {count} jobs', { name: busiest.name.split(/\s+/)[0] ?? busiest.name })}`
}

/** "100 customers in your book", "First ₹1 lakh month", "Best month ever": a milestone card's headline. */
export function milestoneTitle(milestone: { kind: 'customers' | 'lakh_month' | 'best_month'; value?: number }): string {
  if (milestone.kind === 'customers') return t('{count} customers in your book', { count: milestone.value ?? 0 })
  if (milestone.kind === 'lakh_month') return t('First ₹{lakh} lakh month', { lakh: milestone.value ?? 1 })
  return t('Best month ever')
}

/** "Next: First ₹2 lakh month", or null. */
export function milestoneNext(next: { kind: 'customers' | 'lakh_month'; value: number } | null): string | null {
  if (!next) return null
  return next.kind === 'customers'
    ? t('Next: {count} customers', { count: next.value })
    : t('Next: First ₹{lakh} lakh month', { lakh: next.value })
}
