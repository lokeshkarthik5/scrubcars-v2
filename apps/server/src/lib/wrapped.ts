/**
 * Detlio Wrapped (0054): a customer's year with Detlio, as swipeable story
 * cards they can share. Pure, unit-tested (wrapped.test.ts); one endpoint
 * computes a customer-year's stats with bounded reads and caches them in
 * `reward_wrapped`. The cards and their words are the apps' (packages/core/
 * src/wrapped.ts); the images are drawn on the customer's phone.
 *
 * **Which year**: the current IST year from 1 December, and the previous
 * year all year. Admin can preview any customer's, any year.
 *
 * **What counts** is what counts for Detlio Rewards: bookings that earned a
 * Shine Card stamp and were not taken back, completed in that IST year
 * (`completed_at`). Bookings from before rewards went live were never
 * judged, so they are not in it.
 *
 * The figures:
 *   - washes: those bookings;
 *   - saved: the ₹ Detlio Rewards vouchers took off bookings that kept them
 *     (the redemption made that year, DISCOUNT_HELD: the rewards ledger's
 *     own "saved" line, for the year);
 *   - favourite garage: the most bookings; a tie goes to the one visited
 *     last, then the name A–Z;
 *   - busiest month: the IST month with the most; a tie goes to the earlier;
 *   - longest streak: the most IST calendar months in a row with one, inside
 *     the year;
 *   - level: the level at the year's end (or today, during December);
 *   - badges: those earned that year;
 *   - shine days: a car shines for 7 days after a wash (the wash's IST day
 *     and the 6 after), each day counted once however many washes or cars
 *     cover it, inside the year and never past today.
 */
import { longestMonthRun } from './achievements.js'
import { addDays, istDateKey, istMidnight, istParts } from './ist.js'

/** The first year anyone can have a Wrapped: Detlio Rewards started in 2026. */
export const WRAPPED_FIRST_YEAR = 2026
/** A wash keeps a car shining this many days, its own day included. */
export const SHINE_DAYS_PER_WASH = 7
/** The current year's stats are read again after this long. */
export const WRAPPED_CACHE_MS = 6 * 60 * 60 * 1000

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** The years a customer can open now, newest first. */
export function wrappedYears(now: Date): number[] {
  const { year, month } = istParts(now)
  const years: number[] = []
  if (month === 11) years.push(year)
  years.push(year - 1)
  return years.filter((y) => y >= WRAPPED_FIRST_YEAR)
}

export function wrappedAvailable(year: number, now: Date): boolean {
  return wrappedYears(now).includes(year)
}

/** The IST year's first moment, and the next year's. */
export function yearRange(year: number): { start: Date; end: Date } {
  return { start: istMidnight(`${year}-01-01`), end: istMidnight(`${year + 1}-01-01`) }
}

/** "Your Detlio Wrapped is here" goes out in the 10:00–17:59 runs of 1–7 December, IST. */
export function isWrappedPushWindow(now: Date): boolean {
  const p = istParts(now)
  return p.month === 11 && p.day <= 7
}

export function wrappedPushWords(year: number): { title: string; body: string; url: string } {
  return {
    title: 'Your Detlio Wrapped is here',
    body: `Your ${year} with Detlio: washes, garages and how long your car shone.`,
    url: `/profile/rewards/wrapped?year=${year}`,
  }
}

/** Cached stats are fine for a year that ended before they were made; the current one is read again after 6 hours. */
export function wrappedStale(computedAt: Date, year: number, now: Date): boolean {
  if (computedAt >= yearRange(year).end) return false
  return now.getTime() - computedAt.getTime() > WRAPPED_CACHE_MS
}

export interface WrappedBooking {
  completedAt: Date
  vendorId: string
  vendorName: string
}

export function favouriteGarage(bookings: readonly WrappedBooking[]): { name: string; washes: number } | null {
  const byGarage = new Map<string, { name: string; washes: number; last: number }>()
  for (const booking of bookings) {
    const row = byGarage.get(booking.vendorId) ?? { name: booking.vendorName, washes: 0, last: 0 }
    row.washes += 1
    row.last = Math.max(row.last, booking.completedAt.getTime())
    byGarage.set(booking.vendorId, row)
  }
  const best = [...byGarage.values()].sort((a, b) => b.washes - a.washes || b.last - a.last || a.name.localeCompare(b.name))[0]
  return best ? { name: best.name, washes: best.washes } : null
}

export function busiestMonth(bookings: readonly WrappedBooking[]): { month: number; label: string; washes: number } | null {
  const counts = new Array<number>(12).fill(0)
  for (const booking of bookings) counts[istParts(booking.completedAt).month] += 1
  let best = -1
  for (let m = 0; m < 12; m += 1) if (counts[m] > 0 && (best < 0 || counts[m] > counts[best])) best = m
  return best < 0 ? null : { month: best + 1, label: MONTH_NAMES[best], washes: counts[best] }
}

export function longestStreakInYear(bookings: readonly WrappedBooking[]): number {
  return longestMonthRun(bookings.map((b) => istDateKey(b.completedAt).slice(0, 7)))
}

/** Days the car(s) shone: each wash's IST day and the 6 after, counted once, inside the year, never past today. */
export function shineDays(bookings: readonly WrappedBooking[], year: number, now: Date): number {
  const first = `${year}-01-01`
  const yearLast = `${year}-12-31`
  const today = istDateKey(now)
  const last = today < yearLast ? today : yearLast
  const days = new Set<string>()
  for (const booking of bookings) {
    const day = istDateKey(booking.completedAt)
    for (let i = 0; i < SHINE_DAYS_PER_WASH; i += 1) {
      const key = addDays(day, i)
      if (key >= first && key <= last) days.add(key)
    }
  }
  return days.size
}

export interface WrappedStats {
  year: number
  /** Shown on the cards unless the customer hides it; null when unknown. */
  firstName: string | null
  washes: number
  /** "1240.00" */
  saved: string
  favouriteGarage: { name: string; washes: number } | null
  busiestMonth: { month: number; label: string; washes: number } | null
  longestStreak: number
  level: { key: string; label: string }
  badges: { count: number; names: string[] }
  shineDays: number
}

export function buildWrapped(input: {
  year: number
  now: Date
  firstName: string | null
  bookings: readonly WrappedBooking[]
  savedPaise: number
  level: { key: string; label: string }
  badgeNames: readonly string[]
}): WrappedStats {
  const { start, end } = yearRange(input.year)
  const bookings = input.bookings.filter((b) => b.completedAt >= start && b.completedAt < end)
  return {
    year: input.year,
    firstName: input.firstName,
    washes: bookings.length,
    saved: (Math.max(0, input.savedPaise) / 100).toFixed(2),
    favouriteGarage: favouriteGarage(bookings),
    busiestMonth: busiestMonth(bookings),
    longestStreak: longestStreakInYear(bookings),
    level: input.level,
    badges: { count: input.badgeNames.length, names: input.badgeNames.slice(0, 6) },
    shineDays: shineDays(bookings, input.year, input.now),
  }
}

/** The moment the year's level is read at: its end, or now while it is still on. */
export function levelMoment(year: number, now: Date): Date {
  const { end } = yearRange(year)
  return now < end ? now : new Date(end.getTime() - 1)
}
