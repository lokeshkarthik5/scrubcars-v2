import type { HomeOffer, UpdateItem, WashStatus } from '@repo/core/api/home'
import type { OfferFigure } from '@repo/core/offer-figure'

/**
 * How Home and Updates say things: the name in the greeting, an offer's
 * figure and small print, the wash bar's line, and when an update happened.
 * Pure, with the clock passed in, so every line is unit-tested.
 *
 * Times are Chennai time whatever the phone is set to, worked out by hand
 * from the fixed +05:30 offset (India keeps no daylight saving), the way the
 * server's lib/ist.ts does: Intl's "en-IN" output differs between ICU
 * versions ("am" or "AM", with or without a comma), and a row that reads
 * differently on two phones looks like two different events.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function istParts(date: Date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  }
}

/** The IST calendar day of a moment, as a whole-day number for counting. */
function istDayNumber(date: Date): number {
  return Math.floor((date.getTime() + IST_OFFSET_MS) / DAY_MS)
}

/** "11:34 AM" in IST; the minutes always shown, as Updates lists them. */
export function istClock(date: Date): string {
  const p = istParts(date)
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12
  return `${hour12}:${String(p.minute).padStart(2, '0')} ${p.hour < 12 ? 'AM' : 'PM'}`
}

/** "11:30" and "AM" apart, for the big figure on the Next booking tile. */
export function istClockParts(date: Date): { time: string; meridiem: 'AM' | 'PM' } {
  const [time, meridiem] = istClock(date).split(' ')
  return { time, meridiem: meridiem as 'AM' | 'PM' }
}

/** "Thu 15 Oct" in IST. */
export function istDayLabel(date: Date): string {
  const p = istParts(date)
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month]}`
}

/** "Thu" in IST. */
export function istWeekday(date: Date): string {
  return WEEKDAYS[istParts(date).weekday]
}

// ─── The greeting ────────────────────────────────────────────────────────────

/**
 * "Hey Karthik": the first word of the name that is a name, not an initial —
 * longer than one letter and not ending in a full stop, so "R. Karthik" and
 * "R Karthik" both greet Karthik. With no such word, the whole name. The
 * server's twin is firstNameOf in apps/server/src/lib/home-updates.ts; Home
 * uses this one only for the moment before the server's answer arrives.
 */
export function firstNameOf(name: string | null | undefined): string {
  const full = (name ?? '').trim()
  const word = full.split(/\s+/).find((part) => part.length > 1 && !part.endsWith('.'))
  return word ?? full
}

/** The letter in the avatar disc. */
export function initialOf(name: string | null | undefined): string {
  return (firstNameOf(name).charAt(0) || '·').toUpperCase()
}

// ─── Offers ──────────────────────────────────────────────────────────────────

/** The coupon stub's big figure: "25%" or "₹75". */
export function offerFigureOf(offer: Pick<HomeOffer, 'discountType' | 'percentOff' | 'amountOff'>): OfferFigure {
  return offer.discountType === 'percentage'
    ? { kind: 'percent', value: Number(offer.percentOff ?? 0) }
    : { kind: 'amount', rupees: Number(offer.amountOff ?? 0) }
}

/** Shown under an offer the customer cannot use until they save a car. */
export const OFFER_NEEDS_CAR = 'Add your car first'

/**
 * The coupon's two lines of small print, from the server's generated meta
 * line ("Up to ₹300 · Min ₹1,000 · Code DETAIL20 · Till Sat 17 Oct"): the
 * limits on the first line, when it ends on the second. The code is left out,
 * because the stub shows it. "Ends today" / "Ends Sun" stands in for the end
 * date once three days or fewer are left. Nothing here is invented: every
 * word is the server's, from the code's own columns.
 */
export function offerMetaLines(
  offer: Pick<HomeOffer, 'code' | 'metaLine' | 'endsSoon'>,
  options: { hasCar: boolean }
): string[] {
  const parts = offer.metaLine
    .split(' · ')
    .map((part) => part.trim())
    .filter((part) => part && part !== `Code ${offer.code}`)
  const till = parts.find((part) => part.startsWith('Till '))
  const limits = parts.filter((part) => part !== till).join(' · ')
  const when = offer.endsSoon ?? till ?? ''
  const second = options.hasCar ? when : [when, OFFER_NEEDS_CAR].filter(Boolean).join(' · ')
  return [limits, second].filter(Boolean)
}

// ─── The wash bar ────────────────────────────────────────────────────────────

/**
 * The line under the wash bar's figure, in two parts so the state can be
 * set in the heavier weight: "Due in 2 days", "Overdue by 3 days",
 * "Booked" + " for Thu". The state itself is the server's (wash-status.ts);
 * this only words it.
 */
export function washLine(wash: WashStatus, now: Date): { lead: string; rest: string } {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`
  switch (wash.state) {
    case 'booked': {
      if (!wash.bookedFor) return { lead: 'Booked', rest: '' }
      const at = new Date(wash.bookedFor.scheduledAt)
      const days = istDayNumber(at) - istDayNumber(now)
      if (days <= 0) return { lead: 'Booked', rest: ' for today' }
      if (days === 1) return { lead: 'Booked', rest: ' for tomorrow' }
      if (days <= 6) return { lead: 'Booked', rest: ` for ${istWeekday(at)}` }
      const p = istParts(at)
      return { lead: 'Booked', rest: ` for ${p.day} ${MONTHS[p.month]}` }
    }
    case 'overdue':
      return { lead: `Overdue by ${plural(-(wash.daysLeft ?? 0), 'day')}`, rest: '' }
    case 'due_today':
      return { lead: 'Due today', rest: '' }
    case 'due_soon':
    case 'ok':
      return { lead: `Due in ${plural(wash.daysLeft ?? 0, 'day')}`, rest: '' }
    case 'none':
      return { lead: '', rest: 'No wash through Detlio yet' }
  }
}

/**
 * The most steps the bar draws. The tile's bar is about 130px wide on a
 * 390pt phone and under 100px on a 320pt one, with a 3px gap between steps:
 * one step a day of a 21- or 30-day interval leaves hairlines, not a meter.
 */
export const WASH_METER_MAX_STEPS = 14

/**
 * The bar itself: one step per day of the interval, lit up to the days
 * since the last wash. Past WASH_METER_MAX_STEPS a step stands for two or
 * three days (21 days in 11 steps, 30 in 10), and one lights once all its
 * days have passed. Full and `over` once the wash is overdue.
 */
export function washMeter(wash: WashStatus): { steps: number; lit: number; over: boolean } {
  const interval = Math.max(1, wash.intervalDays)
  const daysPerStep = Math.ceil(interval / WASH_METER_MAX_STEPS)
  const steps = Math.ceil(interval / daysPerStep)
  const since = Math.max(0, wash.daysSinceWash ?? 0)
  const lit = since >= interval ? steps : Math.min(steps, Math.floor(since / daysPerStep))
  return { steps, lit, over: wash.state === 'overdue' }
}

/** The wash intervals the sheet offers, in days. Kept in step with 0031's CHECK. */
export const WASH_INTERVAL_CHOICES = [7, 10, 14, 21, 30] as const

export const WASH_INTERVAL_DEFAULT_NOTE =
  'Default is every 14 days, every 10 days during the Oct–Dec monsoon.'

// ─── Updates ─────────────────────────────────────────────────────────────────

/**
 * When an update happened, as short as it can be said: "Just now",
 * "10 min ago", "11:34 AM" earlier today, "Sun, 6:00 PM" this week, then
 * "4 Oct" (with the year once it is not this one).
 */
export function updateTimeLabel(atIso: string, now: Date): string {
  const at = new Date(atIso)
  if (Number.isNaN(at.getTime())) return ''
  const ago = now.getTime() - at.getTime()
  if (ago >= 0 && ago < MINUTE_MS) return 'Just now'
  if (ago >= 0 && ago < HOUR_MS) return `${Math.floor(ago / MINUTE_MS)} min ago`
  const days = istDayNumber(now) - istDayNumber(at)
  if (days <= 0) return istClock(at)
  if (days <= 6) return `${istWeekday(at)}, ${istClock(at)}`
  const p = istParts(at)
  return p.year === istParts(now).year ? `${p.day} ${MONTHS[p.month]}` : `${p.day} ${MONTHS[p.month]} ${p.year}`
}

export type UpdateGroupName = 'Today' | 'This week' | 'Earlier'

/**
 * Updates under Today, This week (the six IST days before today) and Earlier,
 * keeping the server's order inside each group (newest first, its notice row
 * leading). Empty groups are left out.
 */
export function groupUpdates<T extends Pick<UpdateItem, 'at'>>(
  items: T[],
  now: Date
): Array<{ name: UpdateGroupName; items: T[] }> {
  const today = istDayNumber(now)
  const groups: Record<UpdateGroupName, T[]> = { Today: [], 'This week': [], Earlier: [] }
  for (const item of items) {
    const days = today - istDayNumber(new Date(item.at))
    groups[days <= 0 ? 'Today' : days <= 6 ? 'This week' : 'Earlier'].push(item)
  }
  return (['Today', 'This week', 'Earlier'] as const)
    .map((name) => ({ name, items: groups[name] }))
    .filter((group) => group.items.length > 0)
}

/** "Thu 15 Oct", the day of the garage-closed card and the Next booking tile. */
export function bookingDayLabel(atIso: string): string {
  return istDayLabel(new Date(atIso))
}

/**
 * The IST date as "YYYY-MM-DD", for things kept per day on the device (the
 * tip's "hide until tomorrow").
 */
export function istDateKey(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}
