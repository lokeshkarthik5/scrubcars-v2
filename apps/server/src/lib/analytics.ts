/**
 * First-party usage events (0040): what may be recorded, and what the
 * admin's Funnel makes of it. Pure, so every rule has a test.
 *
 * Privacy, in one place:
 *
 * - No third party. The customer app sends batches to our own API
 *   (POST /api/v1/events); nothing leaves Detlio.
 * - No cookie and no localStorage for analytics. A visit is a random id the
 *   app keeps in sessionStorage, so it ends with the tab.
 * - No personal data and no free text in an event: its name is one of
 *   ANALYTICS_EVENTS, and its props are a handful of allow-listed facts
 *   (EVENT_PROPS), each with a fixed shape. A search sends the length of
 *   what was typed, never the words. Paths lose their query string and
 *   their ids.
 * - The signed-in customer's id rides along on the app's events (read from
 *   the session cookie by the API, never sent by the app). The API's own
 *   events (booking_paid, booking_cancelled) carry none.
 * - Browsers that say Do Not Track or Global Privacy Control send nothing
 *   (packages/core/src/analytics.ts).
 *
 * The event and prop lists are twinned in packages/core/src/analytics-events.ts
 * for the app (analytics.parity.test.ts), and the event names and prop keys
 * are also in 0040's CHECKs: change all three together.
 */
import type { ServiceCategory } from './categories.js'
import { addDays, daysBetween, istDateKey } from './ist.js'

// ─── What may be recorded ────────────────────────────────────────────────────

/** Events the customer app sends. */
export const CLIENT_EVENTS = [
  'app_open',
  'home_view',
  'garage_list_view',
  'search',
  'map_view',
  'garage_view',
  'service_add',
  'checkout_start',
  'slot_select',
  'address_select',
  'pay_click',
  'review_submit',
  'complaint_submit',
  'help_view',
  'favourite_add',
  'favourite_remove',
] as const

/**
 * Events the API records itself, where the thing happens: a payment
 * landing (the app's confirm or Razorpay's webhook, whichever comes first)
 * and a booking being cancelled. Never accepted from the app.
 */
export const SERVER_EVENTS = ['booking_paid', 'booking_cancelled'] as const

export type ClientEventName = (typeof CLIENT_EVENTS)[number]
export type ServerEventName = (typeof SERVER_EVENTS)[number]
export type AnalyticsEventName = ClientEventName | ServerEventName

export const ANALYTICS_EVENTS: readonly AnalyticsEventName[] = [...CLIENT_EVENTS, ...SERVER_EVENTS]

export const BOOKING_MODES = ['dropin', 'doorstep', 'pickup'] as const
export type BookingMode = (typeof BOOKING_MODES)[number]

/** The service categories a customer can browse by (lib/categories.ts). */
export const BROWSE_CATEGORIES = [
  'car_wash',
  'detailing',
  'coating',
  'scratch_removal',
  'others',
  'package',
] as const satisfies readonly ServiceCategory[]

/** A price as a band, never the amount: rupees, lower bound included. */
export const AMOUNT_BUCKETS = ['under_500', '500_999', '1000_1999', '2000_4999', '5000_plus'] as const
export type AmountBucket = (typeof AMOUNT_BUCKETS)[number]

export function amountBucket(rupees: number): AmountBucket {
  if (!(rupees >= 500)) return 'under_500'
  if (rupees < 1000) return '500_999'
  if (rupees < 2000) return '1000_1999'
  if (rupees < 5000) return '2000_4999'
  return '5000_plus'
}

/** Where in the app a help or complaint step was taken. */
export const EVENT_STEPS = ['booking', 'contact'] as const

/** Who cancelled, on booking_cancelled. */
export const CANCELLED_BY = ['customer', 'garage', 'detlio'] as const

/** Phone, tablet or desktop, from the window's width (never the user agent). */
export const DEVICE_CLASSES = ['phone', 'tablet', 'desktop'] as const
export type DeviceClass = (typeof DEVICE_CLASSES)[number]

/** Every prop key there is. 0040's props CHECK holds the same list. */
export const PROP_KEYS = [
  'vendorId',
  'mode',
  'category',
  'serviceCount',
  'amountBucket',
  'source',
  'step',
  'queryLength',
  'cancelledBy',
] as const
export type PropKey = (typeof PROP_KEYS)[number]

/** The props each event may carry; any other key is refused. */
export const EVENT_PROPS: Record<AnalyticsEventName, readonly PropKey[]> = {
  app_open: ['source'],
  home_view: [],
  garage_list_view: ['mode', 'category'],
  search: ['category', 'queryLength'],
  map_view: ['mode'],
  garage_view: ['vendorId', 'mode'],
  service_add: ['vendorId', 'category'],
  checkout_start: ['vendorId', 'mode', 'serviceCount'],
  slot_select: ['vendorId', 'mode'],
  address_select: ['vendorId', 'mode'],
  pay_click: ['vendorId', 'mode', 'serviceCount', 'amountBucket'],
  review_submit: ['vendorId'],
  complaint_submit: ['step'],
  help_view: ['step'],
  favourite_add: ['vendorId'],
  favourite_remove: ['vendorId'],
  booking_paid: ['vendorId', 'mode', 'serviceCount', 'amountBucket'],
  booking_cancelled: ['vendorId', 'mode', 'cancelledBy'],
}

/** A campaign source (utm_source) as we keep it: a short lowercase slug. */
export const SOURCE_PATTERN = /^[a-z0-9_.-]{1,32}$/

/** An app version as package.json writes it. */
export const APP_VERSION_PATTERN = /^[0-9A-Za-z.+-]{1,32}$/

/** The most events one request may carry. */
export const MAX_EVENTS_PER_BATCH = 25

/**
 * The most bytes one request may carry. 25 events of the longest shape are
 * well under 8 KB; anything bigger is not the app.
 */
export const MAX_BODY_BYTES = 16 * 1024

export const MAX_PATH_LENGTH = 200

/** How long an event is kept. */
export const RETENTION_DAYS = 180

/** Rows one clean-up deletes, at most: one cheap index range per cron run. */
export const PURGE_BATCH = 5000

/** Events older than this go. */
export function retentionCutoff(now: Date): Date {
  return new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
}

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A page's path as we keep it: no query string or hash, every id replaced
 * by ":id" (a booking's id is a way back to a person), a gift link's code by
 * ":code" (0049: the code is the gift; only its hash is ever stored), a
 * shared certificate's token by ":token" (0053, likewise), anything else
 * that is not a plain path character dropped, at most MAX_PATH_LENGTH
 * characters. The app does the same before sending; this is the server's
 * own copy.
 */
export function cleanPath(raw: string): string {
  const path = raw.split(/[?#]/)[0] ?? ''
  const segments = path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment, index, all) =>
      index > 0 && all[index - 1] === 'gift'
        ? ':code'
        : index > 0 && all[index - 1] === 'verify'
          ? ':token'
          : UUID_SEGMENT.test(segment)
            ? ':id'
            : segment.replace(/[^A-Za-z0-9_-]/g, '')
    )
    .filter((segment) => segment.length > 0)
  return `/${segments.join('/')}`.slice(0, MAX_PATH_LENGTH)
}

/**
 * Crawlers and scripted browsers, by their own words. Playwright's headless
 * Chrome says "HeadlessChrome", which the E2E stack lets through
 * (ANALYTICS_ALLOW_HEADLESS=1) so a spec can see its own events.
 */
export function isLikelyBot(userAgent: string | undefined, allowHeadless = false): boolean {
  if (!userAgent) return true
  const ua = userAgent.toLowerCase()
  if (/bot|crawler|crawling|spider|slurp|lighthouse|facebookexternalhit/.test(ua)) return true
  return !allowHeadless && ua.includes('headless')
}

// ─── The API's own events ────────────────────────────────────────────────────

/** What the API knows of a booking when it records booking_paid or booking_cancelled. */
export interface BookingFacts {
  vendorId: string
  bookingType: BookingMode
  /** What the customer paid, rupees. */
  amount: string
  paymentStatus: string | null
  /** The Razorpay mode of its payment (0032); null on old rows. */
  gatewayMode: string | null
  serviceCount: number
}

/** Statuses that mean the booking's money landed (lib/commission.ts says the same). */
const LANDED = new Set(['paid', 'collected', 'refunded'])

/**
 * The props of booking_paid or booking_cancelled, or null when the event is
 * not recorded: a payment made with Razorpay's test keys or the E2E fake
 * (a test booking, not a customer), or a cancelled booking that was never
 * paid for (not a step anyone took towards a booking).
 */
export function bookingEventProps(
  name: ServerEventName,
  facts: BookingFacts,
  cancelledBy?: (typeof CANCELLED_BY)[number]
): Record<string, string | number> | null {
  if (facts.gatewayMode === 'test' || facts.gatewayMode === 'fake') return null
  if (!LANDED.has(facts.paymentStatus ?? '')) return null

  const props: Record<string, string | number> = { vendorId: facts.vendorId, mode: facts.bookingType }
  if (name === 'booking_paid') {
    if (facts.serviceCount >= 1) props.serviceCount = Math.min(20, facts.serviceCount)
    props.amountBucket = amountBucket(Number(facts.amount))
  } else if (cancelledBy) {
    props.cancelledBy = cancelledBy
  }
  return props
}

// ─── The Funnel ──────────────────────────────────────────────────────────────

/**
 * The steps from a visit to a paid booking. Each but the last counts the
 * visits that did it at least once; the last counts bookings paid (the API's
 * own event), since a payment is recorded where it lands, not in a visit.
 */
export const FUNNEL_STEPS = [
  { key: 'visits', event: null, label: 'Visits' },
  { key: 'garage', event: 'garage_view', label: 'Saw a garage' },
  { key: 'checkout', event: 'checkout_start', label: 'Started checkout' },
  { key: 'slot', event: 'slot_select', label: 'Picked a slot' },
  { key: 'pay', event: 'pay_click', label: 'Pressed Pay' },
  { key: 'paid', event: 'booking_paid', label: 'Paid' },
] as const

export type FunnelStepKey = (typeof FUNNEL_STEPS)[number]['key']

export interface FunnelStep {
  key: FunnelStepKey
  label: string
  count: number
  /** This step over the one before, 0–1; null for the first, or after a zero. */
  ofPrevious: number | null
  /** This step over visits, 0–1; null with no visits. */
  ofVisits: number | null
}

export interface FunnelSummary {
  steps: FunnelStep[]
  /**
   * The step most people were lost before (the largest fall in count from
   * the step before it), or null when nothing fell. Ties go to the earlier
   * step, where the fix would help everyone after it.
   */
  biggestDrop: { key: FunnelStepKey; lost: number; ofPrevious: number | null } | null
}

function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null
}

/** The funnel's counts, conversions and its biggest drop. */
export function summariseEventFunnel(counts: Record<FunnelStepKey, number>): FunnelSummary {
  const visits = counts.visits
  const steps: FunnelStep[] = FUNNEL_STEPS.map((step, i) => {
    const count = counts[step.key]
    const previous = i === 0 ? null : counts[FUNNEL_STEPS[i - 1].key]
    return {
      key: step.key,
      label: step.label,
      count,
      ofPrevious: previous === null ? null : ratio(count, previous),
      ofVisits: ratio(count, visits),
    }
  })

  let biggestDrop: FunnelSummary['biggestDrop'] = null
  for (let i = 1; i < steps.length; i++) {
    const lost = steps[i - 1].count - steps[i].count
    if (lost > 0 && (!biggestDrop || lost > biggestDrop.lost)) {
      biggestDrop = { key: steps[i].key, lost, ofPrevious: steps[i].ofPrevious }
    }
  }
  return { steps, biggestDrop }
}

/** One garage's page views against its paid bookings, both from events. */
export interface GarageViewsRow {
  vendorId: string
  name: string | null
  views: number
  bookings: number
}

/** The garages most looked at, with the share of views that became a booking. */
export function summariseGarageViews(rows: GarageViewsRow[], top = 10) {
  return [...rows]
    .sort((a, b) => b.views - a.views || b.bookings - a.bookings || a.vendorId.localeCompare(b.vendorId))
    .slice(0, top)
    .map((row) => ({ ...row, viewToBooking: ratio(row.bookings, row.views) }))
}

/** Visits that browsed each category, every category present, most first. */
export function summariseCategories(rows: Array<{ category: string | null; visits: number }>) {
  const counts = new Map<string, number>(BROWSE_CATEGORIES.map((category) => [category, 0]))
  for (const row of rows) {
    if (row.category && counts.has(row.category)) {
      counts.set(row.category, (counts.get(row.category) ?? 0) + row.visits)
    }
  }
  return BROWSE_CATEGORIES.map((category) => ({ category, visits: counts.get(category) ?? 0 })).sort(
    (a, b) => b.visits - a.visits || BROWSE_CATEGORIES.indexOf(a.category) - BROWSE_CATEGORIES.indexOf(b.category)
  )
}

/** Visits by device, every class present, with each one's share. */
export function summariseDevices(rows: Array<{ device: string | null; visits: number }>) {
  const counts = new Map<DeviceClass, number>(DEVICE_CLASSES.map((device) => [device, 0]))
  for (const row of rows) {
    if (row.device && counts.has(row.device as DeviceClass)) {
      counts.set(row.device as DeviceClass, (counts.get(row.device as DeviceClass) ?? 0) + row.visits)
    }
  }
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0)
  return DEVICE_CLASSES.map((device) => ({
    device,
    visits: counts.get(device) ?? 0,
    share: ratio(counts.get(device) ?? 0, total),
  }))
}

// ─── Returning customers (from bookings, not events) ────────────────────────

/** A customer's paid booking, as a reschedule chain dated by its first row. */
export interface CustomerBooking {
  userId: string
  bookedAt: Date
}

/** How long after a booking another one counts as coming back. */
export const RETURN_WINDOWS = [30, 60] as const

export interface ReturnWindow {
  days: number
  /** Customers whose booking in the period is at least `days` old, so we can tell. */
  eligible: number
  /** Of those, the ones who booked again within `days` of it. */
  returned: number
  rate: number | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Of the customers with a paid booking made in [start, end), how many
 * booked again within 30 and 60 days of it. Each customer counts once, from
 * their first paid booking in the period; another paid booking (made any
 * time after it, inside or outside the period) within the window is a
 * return. A customer whose booking is not yet `days` old is left out of
 * that window, since they still might.
 *
 * `bookings` must hold every paid booking of those customers from `start`
 * on (the repository reads them), already without Test-marked ones.
 */
export function returningCustomers(
  bookings: CustomerBooking[],
  start: Date,
  end: Date,
  now: Date
): { customers: number; windows: ReturnWindow[] } {
  const byCustomer = new Map<string, number[]>()
  for (const booking of bookings) {
    const times = byCustomer.get(booking.userId) ?? []
    times.push(booking.bookedAt.getTime())
    byCustomer.set(booking.userId, times)
  }

  let customers = 0
  const tallies = RETURN_WINDOWS.map((days) => ({ days, eligible: 0, returned: 0 }))
  for (const times of byCustomer.values()) {
    times.sort((a, b) => a - b)
    const anchor = times.find((t) => t >= start.getTime() && t < end.getTime())
    if (anchor === undefined) continue
    customers++
    const next = times.find((t) => t > anchor)
    for (const tally of tallies) {
      const window = tally.days * DAY_MS
      if (anchor + window > now.getTime()) continue
      tally.eligible++
      if (next !== undefined && next - anchor <= window) tally.returned++
    }
  }

  return {
    customers,
    windows: tallies.map((tally) => ({ ...tally, rate: ratio(tally.returned, tally.eligible) })),
  }
}

/** The Monday of a date's week (ISO weeks), as Statistics' weekly bars use. */
function mondayOf(date: string): string {
  // 1970-01-05 was a Monday.
  const offset = ((daysBetween('1970-01-05', date) % 7) + 7) % 7
  return addDays(date, -offset)
}

export interface NewRepeatWeek {
  /** The first and last day of the week inside the range. */
  start: string
  end: string
  /** False for a week the range only partly covers. */
  full: boolean
  /** Paid bookings that were the customer's first ever. */
  new: number
  /** Paid bookings by a customer who had paid for one before. */
  repeat: number
}

/**
 * Paid bookings per week (Monday to Sunday, IST), split into a customer's
 * first ever and the ones after. `bookings` must hold every paid booking of
 * the customers who booked in the range, from their very first, so "first
 * ever" is true; Test-marked ones already left out.
 */
export function newVsRepeatByWeek(
  bookings: CustomerBooking[],
  range: { from: string; to: string }
): NewRepeatWeek[] {
  const weeks = new Map<string, NewRepeatWeek>()
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
    const key = mondayOf(day)
    const week = weeks.get(key)
    if (week) week.end = day
    else weeks.set(key, { start: day, end: day, full: false, new: 0, repeat: 0 })
  }
  for (const week of weeks.values()) week.full = daysBetween(week.start, week.end) === 6

  const firstOf = new Map<string, number>()
  for (const booking of bookings) {
    const t = booking.bookedAt.getTime()
    const first = firstOf.get(booking.userId)
    if (first === undefined || t < first) firstOf.set(booking.userId, t)
  }

  for (const booking of bookings) {
    const day = istDateKey(booking.bookedAt)
    if (day < range.from || day > range.to) continue
    const week = weeks.get(mondayOf(day))
    if (!week) continue
    if (firstOf.get(booking.userId) === booking.bookedAt.getTime()) week.new++
    else week.repeat++
  }
  return [...weeks.values()]
}
