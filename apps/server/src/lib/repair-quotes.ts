/**
 * Repair & bodywork quotes (0075, owner OK 15 Nov 2026), as pure rules.
 * Clock-free: every function that needs the time is passed it.
 *
 * Dent or scratch? The customer shows the damage (a 15–30 s video and/or up
 * to 3 photos) and says what happened in one line. Detlio writes a plain
 * brief from still frames (lib/repair-quote-brief.ts). The request goes to
 * the nearest REPAIR_QUOTE_RULES.maxGarages garages that take repair quotes
 * (admin's switch) and can be booked for a visit (a "price on inspection"
 * service with no fee, 0073); each has 4 of its working hours to answer "Can
 * do" (an estimate) or "Can't do" (lib/response-deadline.ts's clock, which
 * stops while the garage is shut). The request closes 48 hours after it was
 * sent. The customer books a visit at one garage, with nothing to pay: the
 * garage looks at the car and sets the price with its final bill.
 *
 * The apps' twin is packages/core/src/repair-quotes.ts
 * (repair-quotes.parity.test.ts keeps the numbers the same).
 */
import { garageRespondBy, type GarageCalendar } from './response-deadline.js'

export const REPAIR_QUOTE_RULES = {
  /** Garages asked, nearest first. */
  maxGarages: 5,
  /** How far from the customer a garage may be, in km (the drop-in list's radius). */
  reachKm: 50,
  /** Working-hours minutes each garage has to answer. */
  answerMinutes: 4 * 60,
  /** How long a request stays open for quotes and booking. */
  openHours: 48,
  /** The video: 15–30 seconds, at most 60 MB. */
  videoMinSecs: 15,
  videoMaxSecs: 30,
  videoMaxBytes: 60 * 1024 * 1024,
  /** A photo or frame, once re-encoded on the phone. */
  photoMaxBytes: 8 * 1024 * 1024,
  /** The customer's own photos. */
  maxPhotos: 3,
  /** Frames the phone takes from the video for the brief. */
  maxFrames: 4,
  /** "What happened?" */
  noteMax: 140,
  /** The brief garages read. */
  briefMax: 240,
  /** The garage's note and its reason for "Can't do". */
  garageNoteMax: 200,
  /** The estimate, in whole rupees. */
  priceMax: 500_000,
  daysMax: 30,
  /** Open requests one customer may have at once. */
  maxOpenPerCustomer: 2,
  /** "Final bills match quotes": quoted jobs done with a final bill, at least. */
  badgeMinJobs: 3,
} as const

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

/** When a request sent at `sentAt` closes. */
export function requestClosesAt(sentAt: Date): Date {
  return new Date(sentAt.getTime() + REPAIR_QUOTE_RULES.openHours * HOUR_MS)
}

/**
 * When one garage must have answered: 4 of its working hours from when it
 * was asked (the clock stops while it is shut, as for a paid booking), and
 * never later than an hour before the request closes (the response
 * deadline's own margin, with its 15-minute floor).
 */
export function garageAnswerBy(input: { askedAt: Date; closesAt: Date; calendar: GarageCalendar }): Date {
  return garageRespondBy({
    from: input.askedAt,
    scheduledAt: input.closesAt,
    windowMins: REPAIR_QUOTE_RULES.answerMinutes,
    calendar: input.calendar,
  }).respondBy
}

// ─── Where a request stands ─────────────────────────────────────────────────

export type RequestState = 'open' | 'booked' | 'cancelled' | 'expired'

export function requestState(
  request: { status: string; closesAt: Date },
  now: Date
): RequestState {
  if (request.status === 'booked') return 'booked'
  if (request.status === 'cancelled') return 'cancelled'
  return request.closesAt.getTime() <= now.getTime() ? 'expired' : 'open'
}

/**
 * One garage's answer as the customer, the garage and admin read it:
 * waiting (in time), quoted ("Can do"), declined ("Can't do"), missed (its
 * time ran out with no answer) or closed (the request ended before it
 * answered).
 */
export type QuoteState = 'waiting' | 'quoted' | 'declined' | 'missed' | 'closed'

export function quoteState(
  quote: { status: string; respondBy: Date },
  request: RequestState,
  now: Date
): QuoteState {
  if (quote.status === 'quoted') return 'quoted'
  if (quote.status === 'declined') return 'declined'
  if (request !== 'open') return 'closed'
  return quote.respondBy.getTime() <= now.getTime() ? 'missed' : 'waiting'
}

export type AnswerRefusal = 'closed' | 'time_passed' | 'already_answered'

/** Why a garage may not answer now, or null when it may. */
export function answerRefusal(
  quote: { status: string; respondBy: Date },
  request: RequestState,
  now: Date
): AnswerRefusal | null {
  if (quote.status !== 'waiting') return 'already_answered'
  if (request !== 'open') return 'closed'
  if (quote.respondBy.getTime() <= now.getTime()) return 'time_passed'
  return null
}

export type BookRefusal = 'not_open' | 'not_quoted'

/** Why the customer may not book a visit from this quote, or null. */
export function bookRefusal(quote: { status: string }, request: RequestState): BookRefusal | null {
  if (request !== 'open') return 'not_open'
  if (quote.status !== 'quoted') return 'not_quoted'
  return null
}

/** Whether a customer with `openCount` open requests may send another. */
export function openLimitReached(openCount: number): boolean {
  return openCount >= REPAIR_QUOTE_RULES.maxOpenPerCustomer
}

// ─── Admin's filters ─────────────────────────────────────────────────────────

export const ADMIN_QUOTE_FILTERS = ['all', 'open', 'booked', 'no_quote', 'expired'] as const
export type AdminQuoteFilter = (typeof ADMIN_QUOTE_FILTERS)[number]

/**
 * Which of admin's chips a request falls under (All holds every one):
 * booked; expired with at least one quote; "No quote" — closed with none,
 * or still open with every garage already out (declined, or its time ran
 * out) and none quoting; open otherwise. A cancelled one is under All only.
 */
export function adminQuoteFilter(
  state: RequestState,
  quotes: readonly QuoteState[]
): Exclude<AdminQuoteFilter, 'all'> | null {
  if (state === 'booked') return 'booked'
  if (state === 'cancelled') return null
  const quoted = quotes.some((q) => q === 'quoted')
  if (state === 'expired') return quoted ? 'expired' : 'no_quote'
  if (!quoted && quotes.length > 0 && quotes.every((q) => q === 'declined' || q === 'missed')) return 'no_quote'
  return 'open'
}

// ─── "Final bills match quotes" ─────────────────────────────────────────────

/** A visit booked from one of the garage's quotes, as the badge reads it. */
export interface QuotedJob {
  priceFrom: number
  priceTo: number
  /** Whether the visit was completed. */
  completed: boolean
  /** Its final bill's total in rupees, or null with no bill (or only a cancelled one). */
  billTotal: number | null
}

/**
 * The badge (owner: "your call on the rule"): a garage shows "Final bills
 * match quotes" once at least REPAIR_QUOTE_RULES.badgeMinJobs of its quoted
 * visits are done with a final bill, and every one of those bills stayed
 * inside the range it quoted. A job with no bill says nothing either way.
 */
export function billsMatchQuotes(jobs: readonly QuotedJob[]): { badge: boolean; inside: number; billed: number } {
  const billed = jobs.filter((job) => job.completed && job.billTotal !== null)
  const inside = billed.filter((job) => job.billTotal! >= job.priceFrom && job.billTotal! <= job.priceTo).length
  return {
    badge: billed.length >= REPAIR_QUOTE_RULES.badgeMinJobs && inside === billed.length,
    inside,
    billed: billed.length,
  }
}

// ─── Media keys ──────────────────────────────────────────────────────────────

/**
 * The folder a customer's repair-quote media go to (lib/job-photo-storage.ts):
 * `repair-quotes/<owner>/`, where `owner` is an opaque token made from the
 * customer's id (repairMediaOwner), so a signed link a garage opens never
 * carries the customer's id.
 */
export function repairMediaFolder(owner: string): string {
  return `repair-quotes/${owner}/`
}

/** Whether a key the app sent back is one of this customer's own uploads (`owner` as above). */
export function isOwnRepairMediaKey(key: string, owner: string): boolean {
  const folder = repairMediaFolder(owner)
  return /^[0-9a-f]{32}$/.test(owner) && key.startsWith(folder) && /^[0-9a-f-]{36}\.(jpg|png|webp|mp4|mov|webm)$/.test(key.slice(folder.length))
}

/** The video types a phone records, and their keys' extensions. */
export const REPAIR_VIDEO_TYPES = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
} as const
export type RepairVideoType = keyof typeof REPAIR_VIDEO_TYPES

// ─── Words ───────────────────────────────────────────────────────────────────

/** "₹4,000–5,500", the way quotes read everywhere. */
export function priceRangeLabel(from: number, to: number): string {
  const inr = (n: number) => n.toLocaleString('en-IN')
  return from === to ? `₹${inr(from)}` : `₹${inr(from)}–${inr(to)}`
}

/** "2 days" / "1 day". */
export function daysLabel(days: number): string {
  return days === 1 ? '1 day' : `${days} days`
}

/** What garages and admin read as the request's title: the area of the car, else the brief's start. */
export function requestTitle(request: { damageArea: string | null; brief: string }): string {
  const area = request.damageArea?.trim()
  if (area) return area
  const brief = request.brief.trim()
  return brief.length > 60 ? `${brief.slice(0, 57).trimEnd()}…` : brief
}
