/**
 * Customer drop-off (0052, admin only): regular customers of a garage who
 * went quiet on Detlio, the trace a garage leaves when it takes its
 * regulars off the platform. Nothing customer- or garage-facing reads it.
 *
 * Pure, unit-tested (drop-off.test.ts). The bypass-reports module reads the
 * booking chains (bounded, read-only, on request) and hands them here.
 *
 * Definitions (Statistics' conventions: a booking is a reschedule chain,
 * Test-marked chains are left out, days are IST calendar days):
 *
 *   - **Regular**: a customer who completed at least 3 bookings at the
 *     garage whose completion falls in the last 180 IST days.
 *   - **Usual gap**: the median number of IST days between the customer's
 *     consecutive completed bookings anywhere on Detlio over the last 365
 *     days (a regular always has at least two gaps).
 *   - **Went quiet**: no booking anywhere on Detlio for more than twice their
 *     usual gap, and never fewer than 30 days. "A booking" is any chain whose
 *     money landed: the day it was made, or its slot if that is later (so a
 *     booking for next week means they are not quiet). A cancelled one counts
 *     from the day it was made.
 *   - **Per garage**: its regulars, how many went quiet, and the drop-off
 *     rate (quiet ÷ regulars). Flagged at 30% or more with at least 3
 *     regulars, so one quiet customer at a small garage is not a signal.
 *
 * Clock-free: every caller passes `now`.
 */
import { addDays, daysBetween, istDateKey, istMidnight } from './ist.js'

export const DROP_OFF_RULES = {
  /** Completed bookings at one garage, in `regularWindowDays`, to be its regular. */
  regularMinCompleted: 3,
  regularWindowDays: 180,
  /** How far back a customer's gaps are read. */
  historyDays: 365,
  /** Quiet = no booking for more than this many usual gaps… */
  quietMultiplier: 2,
  /** …and never fewer than this many days. */
  minQuietDays: 30,
  /** A garage is flagged at this drop-off rate or more… */
  flagRate: 0.3,
  /** …with at least this many regulars. */
  flagMinRegulars: 3,
} as const

/** One reschedule chain, as the repository reads it (its latest row). */
export interface DropOffChain {
  userId: string
  vendorId: string
  /** The latest row's id: the admin link. */
  bookingId: string
  /** completed, cancelled, or still on (pending, confirmed, in_progress). */
  status: string
  /** When the chain's first booking was made. */
  bookedAt: Date
  /** When the job happened (completion), or its slot when not completed. */
  serviceAt: Date
}

export interface DropOffPair {
  userId: string
  vendorId: string
  /** Completed at this garage in the regular window. */
  completedHere: number
  /** The customer's median gap, in IST days. */
  usualGapDays: number
  /** More than this many quiet days means gone quiet. */
  thresholdDays: number
  /** IST days since their last booking anywhere (0 with one to come). */
  quietDays: number
  wentQuiet: boolean
  /** The last booking at this garage: the admin link to the customer. */
  lastBookingId: string
  lastServiceAt: Date
}

export interface DropOffGarage {
  vendorId: string
  regulars: number
  wentQuiet: number
  /** wentQuiet ÷ regulars, 0–1. */
  rate: number
  flagged: boolean
}

/** The start of the IST day `days − 1` days before today: `days` IST days, today included. */
export function windowStartDays(now: Date, days: number): Date {
  return istMidnight(addDays(istDateKey(now), -(days - 1)))
}

/** The median of a list of numbers (the mean of the middle two when even); null when empty. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * The usual gap between bookings, in IST days: the median of the gaps
 * between consecutive dates. Null with fewer than two dates (no gap yet).
 * Two jobs on the same IST day are a gap of 0.
 */
export function usualGapDays(dates: readonly Date[]): number | null {
  const days = dates.map((date) => istDateKey(date)).sort()
  const gaps: number[] = []
  for (let i = 1; i < days.length; i += 1) gaps.push(daysBetween(days[i - 1]!, days[i]!))
  return median(gaps)
}

/** More than this many quiet days is "went quiet": twice the usual gap, at least 30. */
export function quietThresholdDays(usualGap: number): number {
  return Math.max(DROP_OFF_RULES.quietMultiplier * usualGap, DROP_OFF_RULES.minQuietDays)
}

/**
 * When the customer last booked anywhere: the latest of each chain's booking
 * day and (unless cancelled) its slot, so a booking still to come keeps them
 * from reading quiet.
 */
export function lastBookingAt(chains: readonly DropOffChain[]): Date | null {
  let latest: number | null = null
  for (const chain of chains) {
    const at =
      chain.status === 'cancelled'
        ? chain.bookedAt.getTime()
        : Math.max(chain.bookedAt.getTime(), chain.serviceAt.getTime())
    if (latest === null || at > latest) latest = at
  }
  return latest === null ? null : new Date(latest)
}

/** Whole IST days from `from` to now; 0 when `from` is today or later. */
export function quietDaysSince(from: Date, now: Date): number {
  return Math.max(0, daysBetween(istDateKey(from), istDateKey(now)))
}

/**
 * Every regular customer–garage pair and every garage's figures, from the
 * chains of the customers who are someone's regular (the repository's
 * bounded read). Pairs are sorted quiet first, longest quiet first; garages
 * by drop-off rate, then by how many went quiet.
 */
export function dropOff(chains: readonly DropOffChain[], now: Date): { pairs: DropOffPair[]; garages: DropOffGarage[] } {
  const R = DROP_OFF_RULES
  const regularFrom = windowStartDays(now, R.regularWindowDays).getTime()
  const historyFrom = windowStartDays(now, R.historyDays).getTime()
  const nowMs = now.getTime()

  const byUser = new Map<string, DropOffChain[]>()
  for (const chain of chains) {
    const list = byUser.get(chain.userId) ?? []
    list.push(chain)
    byUser.set(chain.userId, list)
  }

  const pairs: DropOffPair[] = []
  for (const [userId, mine] of byUser) {
    const completed = mine.filter((chain) => chain.status === 'completed' && chain.serviceAt.getTime() <= nowMs)
    const recentHere = new Map<string, DropOffChain[]>()
    for (const chain of completed) {
      const at = chain.serviceAt.getTime()
      if (at < regularFrom) continue
      const list = recentHere.get(chain.vendorId) ?? []
      list.push(chain)
      recentHere.set(chain.vendorId, list)
    }
    const regularAt = [...recentHere].filter(([, list]) => list.length >= R.regularMinCompleted)
    if (regularAt.length === 0) continue

    const gap = usualGapDays(
      completed.filter((chain) => chain.serviceAt.getTime() >= historyFrom).map((chain) => chain.serviceAt)
    )
    if (gap === null) continue
    const threshold = quietThresholdDays(gap)
    const last = lastBookingAt(mine)
    const quietDays = last ? quietDaysSince(last, now) : 0

    for (const [vendorId, list] of regularAt) {
      const lastHere = [...list].sort((a, b) => b.serviceAt.getTime() - a.serviceAt.getTime())[0]!
      pairs.push({
        userId,
        vendorId,
        completedHere: list.length,
        usualGapDays: gap,
        thresholdDays: threshold,
        quietDays,
        wentQuiet: quietDays > threshold,
        lastBookingId: lastHere.bookingId,
        lastServiceAt: lastHere.serviceAt,
      })
    }
  }

  const perGarage = new Map<string, { regulars: number; wentQuiet: number }>()
  for (const pair of pairs) {
    const row = perGarage.get(pair.vendorId) ?? { regulars: 0, wentQuiet: 0 }
    row.regulars += 1
    if (pair.wentQuiet) row.wentQuiet += 1
    perGarage.set(pair.vendorId, row)
  }
  const garages: DropOffGarage[] = [...perGarage].map(([vendorId, row]) => {
    const rate = row.regulars === 0 ? 0 : row.wentQuiet / row.regulars
    return {
      vendorId,
      regulars: row.regulars,
      wentQuiet: row.wentQuiet,
      rate,
      flagged: dropOffFlagged(rate, row.regulars),
    }
  })

  garages.sort((a, b) => b.rate - a.rate || b.wentQuiet - a.wentQuiet || b.regulars - a.regulars || a.vendorId.localeCompare(b.vendorId))
  pairs.sort(
    (a, b) =>
      Number(b.wentQuiet) - Number(a.wentQuiet) ||
      b.quietDays - a.quietDays ||
      a.vendorId.localeCompare(b.vendorId) ||
      a.userId.localeCompare(b.userId)
  )
  return { pairs, garages }
}

/** Flagged: a drop-off rate of 30% or more, with at least 3 regulars. */
export function dropOffFlagged(rate: number, regulars: number): boolean {
  return regulars >= DROP_OFF_RULES.flagMinRegulars && rate >= DROP_OFF_RULES.flagRate
}
