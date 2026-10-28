/**
 * "Request a visit" / "Request a pickup" (customer reach, part 2, 0062).
 *
 * A Doorstep or Pickup & drop garage whose reach stops just short of the
 * customer (lib/reach.ts, within JUST_OUTSIDE_KM past it) can be asked to
 * come anyway. The customer picks the services, a time **window** (not an
 * exact slot, so it is easy to say yes to) and the address, and pays
 * nothing. The garage has two hours to say yes, with a travel fee (₹0, ₹100
 * or ₹200, which it keeps whole) and a start time inside the window, or
 * no. No answer, or no, passes the same request to the next nearest garage
 * that can take it, at most two garages a request. A yes gives the customer
 * two hours to confirm and pay; then it is an ordinary booking.
 *
 * Pure, so every rule is unit-tested without a database
 * (booking-requests.test.ts). The service (modules/booking-requests) reads
 * the rows and the clock and passes them in. The customer app's twin for
 * the words and numbers is packages/core/src/booking-requests.ts
 * (booking-requests.parity.test.ts).
 */
import { JUST_OUTSIDE_KM } from './reach.js'
import { addDaysToDateKey, computeAvailableSlots, filterByCapacity, type BusyInterval } from './slots.js'
import { computeServiceAmount, sumAmounts, type PricedService, type VehicleTier } from './pricing.js'
import { istDateKey, istTimeLabel, MONTHS, WEEKDAYS } from './ist.js'

const MINUTE_MS = 60 * 1000

/** Every number of the request rules in one place: never restate one. */
export const REQUEST_RULES = {
  /** How far past its own reach a garage may be asked (lib/reach.ts). */
  justOutsideKm: JUST_OUTSIDE_KM,
  /** The garage's time to answer. */
  respondMinutes: 120,
  /** No answer by then: the team is told, to phone the garage. */
  alertAfterMinutes: 30,
  /** The customer's time to confirm and pay a yes. */
  confirmMinutes: 120,
  /** A yes's deadline is never later than this before the start. */
  confirmMarginMinutes: 30,
  /** A start time the garage picks is at least this far ahead. */
  startNoticeMinutes: 60,
  /**
   * A window is offered only with a start time at least this far ahead:
   * the garage's two hours to answer, so a yes can never land after the
   * window is gone.
   */
  windowLeadMinutes: 120,
  /** Open requests (waiting or accepted) a customer may have at once. */
  maxOpenPerCustomer: 2,
  /** Garages one request is offered to, the first included. */
  maxGarages: 2,
  /** "Pick a day": how many days ahead. */
  pickDayAheadDays: 14,
  /** The travel fees a garage may add, in rupees. */
  travelFees: [0, 100, 200] as const,
} as const

export type TravelFee = (typeof REQUEST_RULES.travelFees)[number]

export function isTravelFee(value: unknown): value is TravelFee {
  return typeof value === 'number' && (REQUEST_RULES.travelFees as readonly number[]).includes(value)
}

export const REQUEST_STATUSES = [
  'pending',
  'accepted',
  'declined',
  'expired',
  'forwarded',
  'cancelled',
  'converted',
] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

/** Waiting for the garage, or accepted and waiting for the customer: counts toward the two. */
export const OPEN_REQUEST_STATUSES = ['pending', 'accepted'] as const satisfies readonly RequestStatus[]

export function isOpenRequest(status: string): boolean {
  return (OPEN_REQUEST_STATUSES as readonly string[]).includes(status)
}

export type RequestReply = 'accepted' | 'declined'
export type RequestMode = 'doorstep' | 'pickup'

// ─── Windows ─────────────────────────────────────────────────────────────────

export const WINDOW_PARTS = ['morning', 'afternoon', 'evening'] as const
export type WindowPart = (typeof WINDOW_PARTS)[number]

/** Each part of the day, in IST: morning 9–12, afternoon 2–5, evening 5–8. */
export const WINDOW_HOURS: Record<WindowPart, { start: string; end: string; label: string }> = {
  morning: { start: '09:00:00', end: '12:00:00', label: '9–12' },
  afternoon: { start: '14:00:00', end: '17:00:00', label: '2–5' },
  evening: { start: '17:00:00', end: '20:00:00', label: '5–8 pm' },
}

export interface RequestWindow {
  /** IST date, "YYYY-MM-DD". */
  date: string
  part: WindowPart
}

function istInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}+05:30`)
}

/** Where a window starts and ends, as instants. */
export function windowBounds(window: RequestWindow): { start: Date; end: Date } {
  const hours = WINDOW_HOURS[window.part]
  return { start: istInstant(window.date, hours.start), end: istInstant(window.date, hours.end) }
}

const istDateKeyOf = istDateKey

/**
 * The words for a window: "Today 5–8 pm", "Tomorrow 9–12", "Tomorrow 2–5",
 * "Sat 2 Nov, 9–12".
 */
export function windowLabel(window: RequestWindow, now: Date): string {
  const today = istDateKeyOf(now)
  const hours = WINDOW_HOURS[window.part].label
  if (window.date === today) return `Today ${hours}`
  if (window.date === addDaysToDateKey(today, 1)) return `Tomorrow ${hours}`
  const [year, month, day] = window.date.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay()]
  return `${weekday} ${day} ${MONTHS[month! - 1]}, ${hours}`
}

/** A garage's hours on one day, as the slot rule reads them. */
export interface GarageDay {
  /** Paused, a holiday or a weekly off day. */
  closed: boolean
  hours: { openTime: string; closeTime: string; isClosed: boolean } | null | undefined
  intervalMins: number
}

/**
 * The start times inside a window that fit the garage's day for a job this
 * long (the slot rule's own list: on its interval, ending by closing), from
 * `earliest` on. No capacity here: that is the garage's own question when
 * it answers (requestStartTimes).
 */
export function startsInWindow(
  window: RequestWindow,
  day: GarageDay,
  durationMins: number,
  earliest: Date
): Date[] {
  if (day.closed || !day.hours || day.hours.isClosed) return []
  const { start, end } = windowBounds(window)
  return computeAvailableSlots({
    date: window.date,
    openTime: day.hours.openTime,
    closeTime: day.hours.closeTime,
    intervalMins: day.intervalMins,
    isClosed: day.hours.isClosed,
    serviceDurationMins: durationMins,
  })
    .map((iso) => new Date(iso))
    .filter((at) => at >= start && at < end && at >= earliest)
}

/** Whether a window can still be asked of this garage: a start in it, two hours ahead at least. */
export function windowOpen(window: RequestWindow, day: GarageDay, durationMins: number, now: Date): boolean {
  const earliest = new Date(now.getTime() + REQUEST_RULES.windowLeadMinutes * MINUTE_MS)
  return startsInWindow(window, day, durationMins, earliest).length > 0
}

/** The quick choices: today evening, tomorrow morning and afternoon. */
export function quickWindows(now: Date): RequestWindow[] {
  const today = istDateKeyOf(now)
  const tomorrow = addDaysToDateKey(today, 1)
  return [
    { date: today, part: 'evening' },
    { date: tomorrow, part: 'morning' },
    { date: tomorrow, part: 'afternoon' },
  ]
}

/** "Pick a day": the days on offer, from today, morning or afternoon. */
export function pickableDays(now: Date): string[] {
  const today = istDateKeyOf(now)
  return Array.from({ length: REQUEST_RULES.pickDayAheadDays }, (_, i) => addDaysToDateKey(today, i))
}

/** Whether a window the customer sent is one the app offers: a known part, today to 14 days ahead. */
export function windowShapeProblem(window: RequestWindow, now: Date): string | null {
  if (!(WINDOW_PARTS as readonly string[]).includes(window.part)) return 'Pick a part of the day.'
  if (!pickableDays(now).includes(window.date)) return 'Pick a day in the next two weeks.'
  if (window.part === 'evening' && window.date !== istDateKeyOf(now)) {
    return 'Evenings can only be asked for today.'
  }
  return null
}

// ─── Clocks ──────────────────────────────────────────────────────────────────

/**
 * The garage's deadline to answer: two hours, but never later than an hour
 * before the last start the window still has at that garage (so a yes always
 * has a time to say yes to). Null when that leaves under 30 minutes: the
 * window is gone for this garage.
 */
export function respondByFor(now: Date, lastStart: Date | null): Date | null {
  if (!lastStart) return null
  const byClock = now.getTime() + REQUEST_RULES.respondMinutes * MINUTE_MS
  const byWindow = lastStart.getTime() - REQUEST_RULES.startNoticeMinutes * MINUTE_MS
  const at = Math.min(byClock, byWindow)
  if (at < now.getTime() + 30 * MINUTE_MS) return null
  return new Date(at)
}

/**
 * The customer's deadline to confirm and pay a yes: two hours, but never
 * later than 30 minutes before the start.
 */
export function confirmByFor(acceptedAt: Date, startAt: Date): Date {
  return new Date(
    Math.min(
      acceptedAt.getTime() + REQUEST_RULES.confirmMinutes * MINUTE_MS,
      startAt.getTime() - REQUEST_RULES.confirmMarginMinutes * MINUTE_MS
    )
  )
}

/** Whether the team should be told a request has waited 30 minutes with no answer. */
export function needsNoReplyAlert(
  request: { status: string; createdAt: Date; opsAlertedAt: Date | null },
  now: Date
): boolean {
  return (
    request.status === 'pending' &&
    request.opsAlertedAt === null &&
    now.getTime() - request.createdAt.getTime() >= REQUEST_RULES.alertAfterMinutes * MINUTE_MS
  )
}

/** What the cron does with a request now. */
export type RequestClockStep = 'expire_waiting' | 'expire_accepted' | null

export function clockStep(
  request: { status: string; respondBy: Date; confirmBy: Date | null },
  now: Date
): RequestClockStep {
  if (request.status === 'pending' && request.respondBy <= now) return 'expire_waiting'
  if (request.status === 'accepted' && request.confirmBy && request.confirmBy <= now) return 'expire_accepted'
  return null
}

// ─── The garage's answer ─────────────────────────────────────────────────────

/**
 * The start times the garage may pick when it says yes: inside the window,
 * an hour ahead at least, on its slot interval, ending by closing, and where
 * it still has room (bays and the day's cap).
 */
export function requestStartTimes(input: {
  window: RequestWindow
  day: GarageDay
  durationMins: number
  busy: readonly BusyInterval[]
  bays: number | null | undefined
  jobsPerDay: number | null | undefined
  now: Date
}): Date[] {
  const earliest = new Date(input.now.getTime() + REQUEST_RULES.startNoticeMinutes * MINUTE_MS)
  const starts = startsInWindow(input.window, input.day, input.durationMins, earliest)
  return filterByCapacity(
    starts.map((at) => at.toISOString()),
    { durationMins: input.durationMins, busy: input.busy, bays: input.bays, jobsPerDay: input.jobsPerDay }
  ).map((iso) => new Date(iso))
}

export type AnswerRefusal =
  | 'REQUEST_NOT_WAITING'
  | 'REQUEST_TIME_PASSED'
  | 'TRAVEL_FEE_INVALID'
  | 'START_NOT_OFFERED'

/** Why a yes is refused, or null. `starts` is requestStartTimes for this request now. */
export function acceptRefusal(input: {
  status: string
  respondBy: Date
  travelFee: number
  startAt: Date
  starts: readonly Date[]
  now: Date
}): AnswerRefusal | null {
  if (input.status !== 'pending') return 'REQUEST_NOT_WAITING'
  if (input.respondBy <= input.now) return 'REQUEST_TIME_PASSED'
  if (!isTravelFee(input.travelFee)) return 'TRAVEL_FEE_INVALID'
  if (!input.starts.some((at) => at.getTime() === input.startAt.getTime())) return 'START_NOT_OFFERED'
  return null
}

// ─── Who can be asked ────────────────────────────────────────────────────────

/** A garage as the request rules read it. */
export interface RequestCandidate {
  vendorId: string
  listed: boolean
  offersMode: boolean
  /** Straight-line km from its pin to the customer. */
  distanceKm: number
  /** How far past its reach the customer is; 0 or less when it covers them. */
  outsideKm: number
  /** Its lines for this request, or null when it lacks a wanted service for this car. */
  lines: RequestLine[] | null
  /** Its last start in the window, from now (two hours' lead), or null. */
  lastStart: Date | null
}

export type CandidateRefusal =
  | 'GARAGE_NOT_LISTED'
  | 'MODE_NOT_OFFERED'
  | 'GARAGE_COVERS_YOU'
  | 'TOO_FAR'
  | 'SERVICES_NOT_OFFERED'
  | 'WINDOW_NOT_OPEN'

/**
 * Why the customer's first pick can't be asked, or null. The first garage
 * must be "just outside": one that covers them is booked straight away
 * (409 REQUEST_NOT_NEEDED), one further out is too far.
 */
export function firstGarageRefusal(candidate: RequestCandidate): CandidateRefusal | null {
  if (!candidate.listed) return 'GARAGE_NOT_LISTED'
  if (!candidate.offersMode) return 'MODE_NOT_OFFERED'
  if (candidate.outsideKm <= 0) return 'GARAGE_COVERS_YOU'
  if (candidate.outsideKm > REQUEST_RULES.justOutsideKm) return 'TOO_FAR'
  if (!candidate.lines || candidate.lines.length === 0) return 'SERVICES_NOT_OFFERED'
  if (!candidate.lastStart) return 'WINDOW_NOT_OPEN'
  return null
}

/**
 * The next garage to pass a request to: the nearest one, not asked before
 * in this request, that is listed, offers the mode, reaches the customer or
 * is within 15 km past its reach, has a wanted service for this car, and
 * still has a start in the window. A garage that covers them is fine here:
 * the customer asked to have it done, and it can say yes as easily. Null
 * when there is none, or the request has had its two garages.
 */
export function pickNextGarage(
  candidates: readonly RequestCandidate[],
  tried: ReadonlySet<string>,
  garagesSoFar: number
): RequestCandidate | null {
  if (garagesSoFar >= REQUEST_RULES.maxGarages) return null
  const eligible = candidates.filter(
    (c) =>
      !tried.has(c.vendorId) &&
      c.listed &&
      c.offersMode &&
      c.outsideKm <= REQUEST_RULES.justOutsideKm &&
      c.lines !== null &&
      c.lines.length > 0 &&
      c.lastStart !== null
  )
  eligible.sort((a, b) => a.distanceKm - b.distanceKm || (a.vendorId < b.vendorId ? -1 : 1))
  return eligible[0] ?? null
}

// ─── Services ────────────────────────────────────────────────────────────────

/** A line of a request: a service at its price for the customer's car. */
export interface RequestLine {
  serviceId: string
  name: string
  category: string
  amount: string
  durationMins: number
}

export type RequestService = PricedService & {
  id: string
  name: string
  category: string
  durationMins: number
  isActive: boolean
}

/**
 * The customer's own picks at the first garage: every one active and priced
 * for their car, in their order. Null when any is missing or unpriced.
 */
export function linesForPicks(
  picks: readonly string[],
  services: readonly RequestService[],
  vehicleType: VehicleTier
): RequestLine[] | null {
  const byId = new Map(services.map((s) => [s.id, s]))
  const lines: RequestLine[] = []
  for (const id of picks) {
    const service = byId.get(id)
    if (!service || !service.isActive) return null
    const amount = computeServiceAmount(service, vehicleType)
    if (amount === null || Number(amount) <= 0) return null
    lines.push({ serviceId: service.id, name: service.name, category: service.category, amount, durationMins: service.durationMins })
  }
  return lines.length > 0 ? lines : null
}

/**
 * "The same details" at another garage: for each kind of service the
 * customer asked for (its category, in their order), that garage's cheapest
 * active one priced for their car. Null when it has none of one kind.
 */
export function linesForCategories(
  categories: readonly string[],
  services: readonly RequestService[],
  vehicleType: VehicleTier
): RequestLine[] | null {
  const lines: RequestLine[] = []
  for (const category of [...new Set(categories)]) {
    const priced = services
      .filter((s) => s.isActive && s.category === category)
      .map((s) => ({ s, amount: computeServiceAmount(s, vehicleType) }))
      .filter((x): x is { s: RequestService; amount: string } => x.amount !== null && Number(x.amount) > 0)
      .sort((a, b) => Number(a.amount) - Number(b.amount) || (a.s.id < b.s.id ? -1 : 1))
    const best = priced[0]
    if (!best) return null
    lines.push({ serviceId: best.s.id, name: best.s.name, category, amount: best.amount, durationMins: best.s.durationMins })
  }
  return lines.length > 0 ? lines : null
}

export function linesSubtotal(lines: readonly RequestLine[]): string {
  return sumAmounts(lines.map((line) => line.amount))
}

export function linesDuration(lines: readonly RequestLine[]): number {
  return lines.reduce((sum, line) => sum + line.durationMins, 0)
}

// ─── The customer's own limits ───────────────────────────────────────────────

/** 409 REQUEST_LIMIT once two are open. */
export function openLimitReached(openCount: number): boolean {
  return openCount >= REQUEST_RULES.maxOpenPerCustomer
}

/**
 * Whether a checkout may confirm this request: the customer's own, accepted,
 * before its deadline, and the booking exactly what was accepted (garage,
 * type, services, car, address, start).
 */
export function checkoutMatchRefusal(
  request: {
    userId: string
    vendorId: string
    status: string
    bookingType: string
    vehicleId: string | null
    addressId: string | null
    serviceIds: readonly string[]
    acceptedStartAt: Date | null
    confirmBy: Date | null
  },
  booking: {
    userId: string
    vendorId: string
    bookingType: string
    vehicleId: string
    addressId: string | undefined
    serviceIds: readonly string[]
    scheduledAt: Date
  },
  now: Date
): 'REQUEST_NOT_FOUND' | 'REQUEST_NOT_ACCEPTED' | 'REQUEST_EXPIRED' | 'REQUEST_MISMATCH' | null {
  if (request.userId !== booking.userId) return 'REQUEST_NOT_FOUND'
  if (request.status !== 'accepted') return 'REQUEST_NOT_ACCEPTED'
  if (!request.confirmBy || request.confirmBy <= now) return 'REQUEST_EXPIRED'
  const sameServices =
    request.serviceIds.length === booking.serviceIds.length &&
    [...request.serviceIds].sort().join(',') === [...booking.serviceIds].sort().join(',')
  if (
    request.vendorId !== booking.vendorId ||
    request.bookingType !== booking.bookingType ||
    request.vehicleId !== booking.vehicleId ||
    request.addressId !== (booking.addressId ?? null) ||
    !sameServices ||
    !request.acceptedStartAt ||
    request.acceptedStartAt.getTime() !== booking.scheduledAt.getTime()
  ) {
    return 'REQUEST_MISMATCH'
  }
  return null
}

// ─── Words ───────────────────────────────────────────────────────────────────

/** "3.9 km beyond your 5 km", for the garage's card. Null cover: a drawn area. */
export function beyondLine(outsideKm: number, coverKm: number | null): string {
  const outside = `${Math.max(0.1, Math.round(outsideKm * 10) / 10)} km`
  if (outsideKm <= 0) return 'Inside your area'
  return coverKm === null ? `${outside} beyond your area` : `${outside} beyond your ${formatKm(coverKm)}`
}

function formatKm(km: number): string {
  return `${Number.isInteger(km) ? km : km.toFixed(1)} km`
}

/** "11:41 am", for "They reply by …" and "Confirm by …". */
export function clockLabel(at: Date): string {
  return istTimeLabel(at).toLowerCase()
}
