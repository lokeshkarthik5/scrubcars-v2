/**
 * The rescue: the best other garages when one doesn't answer (owner-approved
 * screens, 15 Nov 2026; mockup 4-rescue-and-flags).
 *
 * A paid booking the garage let lapse (0042, auto-cancelled and refunded) or
 * declined shows "These garages can do the same job": up to three garages
 * that can do the same services for the same car, with free times near the
 * original slot, ranked by how likely they are to say yes quickly. The
 * customer pays again as normal; the first payment is refunded as it always
 * was (nothing here moves or reuses that money).
 *
 * Pure, so every rule is unit-tested without a database
 * (rescue-garages.test.ts). The garage-response module reads the rows and
 * the clock and passes them in. Request-a-visit forwarding
 * (lib/booking-requests.ts `pickNextGarage`) ranks its eligible garages by
 * the same score (without the time part: a request has a window, not a slot).
 *
 * The rules:
 *
 *   - **Who can be offered**: a garage live to customers that takes the
 *     booking's type and reaches the customer (the garage list's own search),
 *     not the one that let them down, that has an active service priced for
 *     the customer's car in every kind of service booked (a package standing
 *     for its members' kinds; that garage's cheapest one of each kind, as
 *     Request-a-visit's "the same details" picks), and a free time for the
 *     whole job on the original day or the day after (from today, when the
 *     original day has passed). Closed, paused, full or not listed: left out.
 *   - **Its times**: on the first of those days with room, the three free
 *     starts closest to the original time of day, earliest first.
 *   - **The score** (0–100, higher first): distance (nearer is better, 15 km
 *     or more scores nothing), how fast it usually answers (the median
 *     minutes from a paid booking reaching it to its accept, over the last 90
 *     days, 60 minutes or more scores nothing), how often it accepts (accepted
 *     ÷ accepted + declined + let lapse, same 90 days), its rating, and
 *     whether a time is within 2 hours of the original; minus a penalty for
 *     each cancellation by the garage after accepting (or a garage no-show)
 *     in the last 30 days. A garage with too little history to say (fewer
 *     than 3 accepts or answers) gets the middle mark for that part, so a new
 *     garage is neither buried nor promoted. Ties: nearer, then by id.
 *
 * Clock-free: every caller passes `now`.
 */
import { addDaysToDateKey, todayDateKey } from './slots.js'
import { istDateKey } from './ist.js'
import { slotsOnDay, nextFreeDayLabel, type GarageWeek, type NextFreeDay } from './next-free.js'
import { cancelledBy, summariseAcceptTime, wasAccepted, MIN_ACCEPT_SAMPLES } from './pilot-stats.js'
import type { BookingType } from './booking-types.js'
import type { RequestLine } from './booking-requests.js'

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS

/** Every number of the rescue in one place: never restate one. */
export const RESCUE_RULES = {
  /** Garages shown on the card. */
  limit: 3,
  /** The nearest garages looked at before ranking (the list's own search, nearest first). */
  poolSize: 12,
  /** Times offered per garage. */
  times: 3,
  /** The original day and this many after it are searched for room. */
  daysAfter: 1,
  /** A time this close to the original counts as "near" it. */
  nearWindowMinutes: 120,
  /** How far back a garage's answers and accepts are read. */
  recordDays: 90,
  /** How far back its cancellations count against it. */
  recentCancelDays: 30,
  /** Fewer answers than this and the part is "not enough history". */
  minSamples: MIN_ACCEPT_SAMPLES,
  /** "Usually answers in N min" is shown only up to this many minutes. */
  answerChipMaxMins: 60,
  /** The score's parts, out of 100. */
  weights: { distance: 30, answer: 25, accept: 20, rating: 15, near: 10 },
  /** Distance scores nothing from here on. */
  maxKm: 15,
  /** Answering in this many minutes or more scores nothing. */
  slowAnswerMins: 60,
  /** Taken off per recent cancellation by the garage, up to the cap. */
  cancelPenalty: 8,
  maxCancelPenalty: 24,
  /** The middle mark for a part with not enough history. */
  neutral: 0.5,
} as const

// ─── A garage's track record ─────────────────────────────────────────────────

/** One of a garage's recent bookings, as the record reads it. */
export interface RecordRow {
  createdAt: Date
  /** When its payment landed; null while unpaid. */
  paidAt: Date | null
  acceptedAt: Date | null
  acceptedBy: string | null
  status: string
  cancelledBy: 'user' | 'vendor' | 'admin' | null
  cancelledOnBehalfOf: 'customer' | 'garage' | 'detlio' | null
  noShow: 'customer' | 'garage' | null
  cancelledAt: Date | null
  /** The garage cancelled it after accepting (0066). */
  garageCancelledAt: Date | null
}

export interface GarageRecord {
  /** Median minutes from a paid booking reaching it to its accept; null with too few. */
  medianAnswerMins: number | null
  /** Accepted ÷ answered (accepted, declined or let lapse); null with too few. */
  acceptRate: number | null
  /** Cancellations by the garage after accepting, and garage no-shows, recently. */
  recentCancels: number
}

/** A garage with no bookings to go on. */
export const NO_RECORD: GarageRecord = { medianAnswerMins: null, acceptRate: null, recentCancels: 0 }

/**
 * A garage's record from its bookings made in the last `recordDays` (the
 * caller reads exactly those). Test-marked bookings are left out by the read.
 */
export function garageRecord(rows: readonly RecordRow[], now: Date): GarageRecord {
  const since = new Date(now.getTime() - RESCUE_RULES.recordDays * DAY_MS)
  const answer = summariseAcceptTime(
    rows.map((row) => ({ createdAt: row.createdAt, paidAt: row.paidAt, acceptedAt: row.acceptedAt })),
    since
  )

  // Only bookings that reached the garage (paid) and that it answered: a
  // yes, or a no (declined, or let its time run out: both the garage's).
  let accepted = 0
  let refused = 0
  for (const row of rows) {
    if (!row.paidAt) continue
    if (wasAccepted(row)) accepted += 1
    else if (cancelledBy(row) === 'garage') refused += 1
  }
  const answered = accepted + refused

  const cancelSince = now.getTime() - RESCUE_RULES.recentCancelDays * DAY_MS
  const recentCancels = rows.filter((row) => {
    if (row.garageCancelledAt) return row.garageCancelledAt.getTime() >= cancelSince
    if (row.noShow === 'garage') return (row.cancelledAt ?? row.createdAt).getTime() >= cancelSince
    return false
  }).length

  return {
    medianAnswerMins: answer.medianAcceptMins,
    acceptRate: answered >= RESCUE_RULES.minSamples ? accepted / answered : null,
    recentCancels,
  }
}

/**
 * "Usually answers in 10 min": the median rounded up to 5 minutes (never
 * "0 min"), or null when there is too little history or it is slower than
 * an hour (not something to point out).
 */
export function usualAnswerMins(record: Pick<GarageRecord, 'medianAnswerMins'>): number | null {
  const median = record.medianAnswerMins
  if (median === null || median > RESCUE_RULES.answerChipMaxMins) return null
  return Math.max(5, Math.ceil(median / 5) * 5)
}

// ─── The score ───────────────────────────────────────────────────────────────

export type Nearness = 'near' | 'same_day' | 'later'

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * The garage's score, 0–100 (before any penalty), higher first. `nearness`
 * left out (Request-a-visit: a window, not a slot) scores that part the
 * middle mark for every garage, so it changes no order.
 */
export function rescueScore(input: {
  distanceKm: number | null
  record: GarageRecord
  rating: number | null
  nearness?: Nearness
}): number {
  const w = RESCUE_RULES.weights
  const distance = input.distanceKm === null ? RESCUE_RULES.neutral : 1 - clamp01(input.distanceKm / RESCUE_RULES.maxKm)
  const answer =
    input.record.medianAnswerMins === null
      ? RESCUE_RULES.neutral
      : 1 - clamp01(input.record.medianAnswerMins / RESCUE_RULES.slowAnswerMins)
  const accept = input.record.acceptRate === null ? RESCUE_RULES.neutral : clamp01(input.record.acceptRate)
  // A star score from 3 (nothing) to 5 (full marks); a garage without one
  // (new on Detlio) gets the middle mark.
  const rating = input.rating === null ? RESCUE_RULES.neutral : clamp01((input.rating - 3) / 2)
  const near =
    input.nearness === undefined
      ? RESCUE_RULES.neutral
      : input.nearness === 'near'
        ? 1
        : input.nearness === 'same_day'
          ? 0.5
          : 0
  const penalty = Math.min(RESCUE_RULES.maxCancelPenalty, input.record.recentCancels * RESCUE_RULES.cancelPenalty)
  const score =
    w.distance * distance + w.answer * answer + w.accept * accept + w.rating * rating + w.near * near - penalty
  return Math.round(score * 100) / 100
}

// ─── Times near the original ─────────────────────────────────────────────────

export interface RescueTimes {
  /** 'today', 'tomorrow' or the IST date of the times, as the API says it. */
  day: NextFreeDay
  /** Up to three ISO starts, earliest first. */
  times: string[]
  /**
   * The original slot, when the times are on its own day ("Today, near
   * 10:30 am"); null when they are on another day.
   */
  near: string | null
  nearness: Nearness
}

/** The days searched: the original day (or today, once it has passed) and the day after. */
export function rescueDays(target: Date, now: number): string[] {
  const today = todayDateKey(now)
  const original = istDateKey(target)
  const first = original < today ? today : original
  return Array.from({ length: RESCUE_RULES.daysAfter + 1 }, (_, i) => addDaysToDateKey(first, i))
}

/** The same IST time of day as `target`, on `date`. */
function sameClockOn(date: string, target: Date): number {
  const original = istDateKey(target)
  const [y1, m1, d1] = original.split('-').map(Number)
  const [y2, m2, d2] = date.split('-').map(Number)
  const shift = Date.UTC(y2!, m2! - 1, d2!) - Date.UTC(y1!, m1! - 1, d1!)
  return target.getTime() + shift
}

/**
 * The garage's free starts for the whole job near the original slot: on the
 * first searched day with room, the three closest to the original time of
 * day (ties: the earlier), earliest first. Null when it has none (closed,
 * paused, full, or not open those days).
 */
export function rescueTimes(
  garage: GarageWeek,
  job: { durationMins: number; bookingType: BookingType },
  target: Date,
  now: number
): RescueTimes | null {
  if (garage.pausedAt) return null
  const today = todayDateKey(now)
  const original = istDateKey(target)
  for (const date of rescueDays(target, now)) {
    const slots = slotsOnDay(garage, job, date, now)
    if (slots.length === 0) continue
    const aim = sameClockOn(date, target)
    const picked = [...slots]
      .sort((a, b) => Math.abs(Date.parse(a) - aim) - Math.abs(Date.parse(b) - aim) || Date.parse(a) - Date.parse(b))
      .slice(0, RESCUE_RULES.times)
      .sort((a, b) => Date.parse(a) - Date.parse(b))
    const onOriginalDay = date === original
    const withinWindow = picked.some(
      (time) => Math.abs(Date.parse(time) - target.getTime()) <= RESCUE_RULES.nearWindowMinutes * MINUTE_MS
    )
    return {
      day: nextFreeDayLabel(date, today),
      times: picked,
      near: onOriginalDay ? target.toISOString() : null,
      nearness: onOriginalDay ? (withinWindow ? 'near' : 'same_day') : 'later',
    }
  }
  return null
}

// ─── Picking the three ───────────────────────────────────────────────────────

/** A garage as the rescue reads it. */
export interface RescueCandidate {
  vendorId: string
  distanceKm: number | null
  rating: number | null
  /** Its lines for the same job and car (linesForCategories), or null when it lacks one. */
  lines: RequestLine[] | null
  /** Its times near the original, or null when it has none. */
  times: RescueTimes | null
  record: GarageRecord
}

export type RankedRescue = RescueCandidate & { lines: RequestLine[]; times: RescueTimes; score: number }

/** The garages to offer, best first, at most RESCUE_RULES.limit. */
export function rankRescue(candidates: readonly RescueCandidate[], exclude: ReadonlySet<string> = new Set()): RankedRescue[] {
  const eligible: RankedRescue[] = []
  for (const c of candidates) {
    if (exclude.has(c.vendorId) || !c.lines || c.lines.length === 0 || !c.times || c.times.times.length === 0) continue
    eligible.push({
      ...c,
      lines: c.lines,
      times: c.times,
      score: rescueScore({ distanceKm: c.distanceKm, record: c.record, rating: c.rating, nearness: c.times.nearness }),
    })
  }
  eligible.sort(
    (a, b) =>
      b.score - a.score ||
      (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) ||
      (a.vendorId < b.vendorId ? -1 : a.vendorId > b.vendorId ? 1 : 0)
  )
  return eligible.slice(0, RESCUE_RULES.limit)
}

/**
 * Whether a booking gets the rescue card: cancelled on the garage's side —
 * it let its time to answer run out (0042), declined, called it off after
 * accepting, or let the customer down on the day (a garage no-show, which
 * admin records) — while it was paid for. A booking the customer cancelled,
 * or Detlio for the customer, gets none.
 */
export function rescueApplies(booking: {
  status: string
  cancelledBy: 'user' | 'vendor' | 'admin' | null
  cancelledOnBehalfOf?: 'customer' | 'garage' | 'detlio' | null
  noShow?: 'customer' | 'garage' | null
  responseMissedAt: Date | null
}): boolean {
  if (booking.status !== 'cancelled') return false
  if (booking.responseMissedAt) return true
  if (booking.noShow === 'garage') return true
  if (booking.noShow === 'customer') return false
  if (booking.cancelledBy === 'vendor') return true
  return booking.cancelledBy === 'admin' && booking.cancelledOnBehalfOf === 'garage'
}

/** Why the card is shown, for its words. */
export type RescueReason = 'not_accepted' | 'declined'

export function rescueReason(booking: { responseMissedAt: Date | null }): RescueReason {
  return booking.responseMissedAt ? 'not_accepted' : 'declined'
}
