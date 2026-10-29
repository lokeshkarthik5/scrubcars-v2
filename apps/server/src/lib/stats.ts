/**
 * The admin's Statistics: what each figure counts, in one place.
 *
 * The repository does the filtering and the sums over child rows in SQL (one
 * row per reschedule chain, with its paid bills and recorded refunds already
 * added up; busy hours and ratings grouped there outright). Everything below
 * turns those rows into the page's figures, so each definition is one
 * readable rule with a test, and the Overview, the Breakdown and the
 * Commission tabs can never count a booking two ways.
 *
 * The rules, as the page's "How we count" says them:
 *
 * - Days are India days (lib/ist.ts). Money and the funnel go by the day the
 *   booking was made; busy hours by the day of the slot.
 * - A booking is a reschedule chain: a move writes a new row and cancels the
 *   old one, so only the chain's latest row says how it ended, and the chain
 *   is dated by its first booking (as lib/pilot-stats.ts does).
 * - A booking counts once its payment landed (paid, cash collected, or paid
 *   and since refunded).
 * - "Collected after refunds" is the booking's payment when it landed, plus
 *   final bills paid in the app, less every refund recorded against the
 *   booking or those paid bills (refund_records). A stray payment on a
 *   replaced or withdrawn bill is neither added nor taken off: it paid for
 *   nothing and always goes back. A refund owed but not yet recorded is
 *   still collected.
 * - A checkout started is a booking intent that never became a booking, or a
 *   booking (each one began as a checkout, or as an old pay-later booking).
 * - Bookings ops marked Test, and their checkouts, are left out everywhere:
 *   by `counted` here for chains, and in SQL for what is grouped there.
 *
 * Pure and clock-free: the caller passes the range and the rows.
 */
import {
  chainCommission,
  moneyLanded,
  type CommissionBooking,
  type CommissionItem,
} from './commission.js'
import type { ServiceCategory } from './categories.js'
import { addDays, daysBetween, istMidnight } from './ist.js'

/** The longest range one request may ask for. */
export const MAX_RANGE_DAYS = 366

/** Past this many weeks, collected money is shown by month instead. */
export const MAX_WEEK_BARS = 26

/** Two IST calendar dates, "YYYY-MM-DD", both included. */
export interface StatsRange {
  from: string
  to: string
}

/** How many days a range covers. */
export function rangeDays(range: StatsRange): number {
  return daysBetween(range.from, range.to) + 1
}

/** The instants a range covers: from its first midnight up to, not including, the day after it. */
export function rangeInstants(range: StatsRange): { start: Date; end: Date } {
  return { start: istMidnight(range.from), end: istMidnight(addDays(range.to, 1)) }
}

/** Every date in the range, in order. */
export function datesIn(range: StatsRange): string[] {
  return Array.from({ length: rangeDays(range) }, (_, i) => addDays(range.from, i))
}

function isWholeMonth(range: StatsRange): boolean {
  return (
    range.from.endsWith('-01') &&
    addDays(range.to, 1).endsWith('-01') &&
    range.from.slice(0, 7) === range.to.slice(0, 7)
  )
}

/**
 * The period a range is compared with. A whole calendar month is compared
 * with the month before it; anything else with the same number of days just
 * before it, so "Last 30 days" is set against the 30 days before those.
 */
export function previousRange(range: StatsRange): StatsRange {
  if (isWholeMonth(range)) {
    const to = addDays(range.from, -1)
    return { from: `${to.slice(0, 7)}-01`, to }
  }
  const days = rangeDays(range)
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) }
}

/** One reschedule chain, as the repository reads it: its latest row, dated by its first. */
export interface StatsChainRow {
  rootId: string
  vendorId: string
  vendorName: string
  /** The IST day the chain's first booking was made, "YYYY-MM-DD". */
  bookedDay: string
  status: string
  noShow: 'customer' | 'garage' | null
  acceptedBy: string | null
  paymentStatus: string | null
  paymentAmount: string | null
  paymentRefunded: string | null
  amount: string
  subtotalAmount: string
  /** An accepted request's travel fee (0062), inside the subtotal; no commission on it. Optional. */
  travelFee?: string | null
  discountFundedBy: 'platform' | 'vendor' | null
  /** Final bills paid in the app on any row of the chain, added up. */
  billsPaid: string | null
  /** Refunds recorded against the chain's payments and bills, added up. */
  refundsRecorded: string | null
  /** Marked Test by ops (0032), on the whole chain. */
  markedTest: boolean
  /**
   * Its latest row was cancelled by the cron because the garage did not
   * accept in time (0042). Already a cancellation by the garage
   * (cancelled_by 'vendor'); this only tells it apart.
   */
  responseMissed?: boolean
  /**
   * Detlio approved a refund instead of a free redo on it (0051): no
   * commission, as the garage earns nothing on it. Optional: absent is false.
   */
  guaranteeRefund?: boolean
}

/** A booking item, keyed by its chain. */
export interface StatsItemRow extends CommissionItem {
  rootId: string
}

/** Checkouts that never became a booking, by how they ended. */
export interface OpenCheckouts {
  /** Abandoned, or still open: nobody paid. */
  pending: number
  /** Paid, but the booking could not be written: each one is a refund. */
  failed: number
}

function toPaise(rupees: string | null | undefined): number {
  const value = Number(rupees ?? 0)
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}

function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null
}

/**
 * The chains the figures are about: every one but those ops marked Test.
 * Each summary below starts here, so a test booking cannot reach a figure by
 * one path and not another.
 */
export function counted<T extends { markedTest: boolean }>(rows: T[]): T[] {
  return rows.filter((row) => !row.markedTest)
}

/** A booking counts once its payment landed. */
export function isPaid(row: Pick<StatsChainRow, 'paymentStatus'>): boolean {
  return moneyLanded(row.paymentStatus)
}

/**
 * Collected after refunds on one chain, in paise: its payment if it landed,
 * plus its paid final bills, less every refund recorded on them.
 */
export function collectedPaise(row: StatsChainRow): number {
  const payment = isPaid(row) ? toPaise(row.paymentAmount) : 0
  return payment + toPaise(row.billsPaid) - toPaise(row.refundsRecorded)
}

/**
 * How a paid booking stands now. A no-show is its own outcome, not a
 * cancellation. 'not_done' is every other one, pending, confirmed or in
 * progress: not "upcoming", because nothing completes a booking on its own,
 * so a job whose slot passed weeks ago and that the garage never marked done
 * is here too, and that is worth spotting.
 */
export type StatsOutcome = 'completed' | 'cancelled' | 'no_show' | 'not_done'

export function outcomeOf(row: Pick<StatsChainRow, 'status' | 'noShow'>): StatsOutcome {
  if (row.status === 'completed') return 'completed'
  if (row.status === 'cancelled') return row.noShow ? 'no_show' : 'cancelled'
  return 'not_done'
}

/** The chain's items, grouped once for everything that needs them. */
export function itemsByChain(items: StatsItemRow[]): Map<string, StatsItemRow[]> {
  const grouped = new Map<string, StatsItemRow[]>()
  for (const item of items) {
    const list = grouped.get(item.rootId) ?? []
    list.push(item)
    grouped.set(item.rootId, list)
  }
  return grouped
}

/** The facts commission needs of a chain. */
export function commissionBooking(row: StatsChainRow, items: CommissionItem[]): CommissionBooking {
  return {
    status: row.status,
    noShow: row.noShow,
    paymentStatus: row.paymentStatus,
    paymentRefunded: row.paymentRefunded,
    amount: row.amount,
    subtotalAmount: row.subtotalAmount,
    discountFundedBy: row.discountFundedBy,
    items,
    billsPaid: row.billsPaid,
    guaranteeRefund: row.guaranteeRefund ?? false,
    travelFee: row.travelFee ?? null,
  }
}

/** Commission on each chain in `rows`, keyed by its root, given each chain's place in its garage's queue. */
export function commissionByChain(
  rows: StatsChainRow[],
  items: Map<string, StatsItemRow[]>,
  positions: Map<string, number>
): Map<string, number> {
  return new Map(
    rows.map((row) => [
      row.rootId,
      chainCommission(commissionBooking(row, items.get(row.rootId) ?? []), positions.get(row.rootId)),
    ])
  )
}

export interface StatsKpis {
  /** Paid bookings made in the period. */
  bookings: number
  /** Collected after refunds, rupees. */
  collected: number
  /** Detlio's commission on the period's bookings, rupees (lib/commission.ts). */
  commission: number
  /** Collected over bookings; null with no bookings. */
  averageBooking: number | null
  checkoutsStarted: number
  /** Paid bookings over checkouts started, 0–1; null with none started. */
  paidOfStarted: number | null
  /** Paid bookings since cancelled, no-shows apart. */
  cancelled: number
  /** Cancelled over paid bookings, 0–1; null with no bookings. */
  cancellationRate: number | null
}

/** The Overview's tiles for one period. `rows` are the chains booked in it. */
export function summariseKpis(
  chains: StatsChainRow[],
  open: OpenCheckouts,
  commission: Map<string, number>
): StatsKpis {
  const rows = counted(chains)
  const paid = rows.filter(isPaid)
  const collected = rows.reduce((sum, row) => sum + collectedPaise(row), 0)
  const commissionPaise = rows.reduce(
    (sum, row) => sum + Math.round((commission.get(row.rootId) ?? 0) * 100),
    0
  )
  const cancelled = paid.filter((row) => outcomeOf(row) === 'cancelled').length
  const checkoutsStarted = rows.length + open.pending + open.failed

  return {
    bookings: paid.length,
    collected: collected / 100,
    commission: commissionPaise / 100,
    averageBooking: paid.length > 0 ? Math.round(collected / paid.length) / 100 : null,
    checkoutsStarted,
    paidOfStarted: ratio(paid.length, checkoutsStarted),
    cancelled,
    cancellationRate: ratio(cancelled, paid.length),
  }
}

/** Paid bookings on each day of the range, every day present. */
export function bookingsPerDay(
  rows: StatsChainRow[],
  range: StatsRange
): Array<{ date: string; bookings: number }> {
  const counts = new Map(datesIn(range).map((date) => [date, 0]))
  for (const row of counted(rows)) {
    if (isPaid(row) && counts.has(row.bookedDay)) {
      counts.set(row.bookedDay, (counts.get(row.bookedDay) ?? 0) + 1)
    }
  }
  return [...counts].map(([date, bookings]) => ({ date, bookings }))
}

/** One bar of "Collected per week" (or per month, for a long range). */
export interface CollectedBar {
  /** The first and last day of the bar inside the range. */
  start: string
  end: string
  days: number
  /** False for a week or month the range only partly covers. */
  full: boolean
  collected: number
}

/** The Monday of a date's week (ISO weeks, as Indian calendars print them). */
function mondayOf(date: string): string {
  // 1970-01-05 was a Monday.
  const offset = ((daysBetween('1970-01-05', date) % 7) + 7) % 7
  return addDays(date, -offset)
}

function monthOf(date: string): string {
  return `${date.slice(0, 7)}-01`
}

function daysInMonth(first: string): number {
  const [year, month] = first.split('-').map(Number)
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Collected after refunds per week, Monday to Sunday, or per calendar month
 * when the range would need more than MAX_WEEK_BARS weeks. Every bar is
 * present, and the first and last say when the range only covers part of
 * them, so a short week is not read as a slow one.
 */
export function collectedPerPeriod(
  rows: StatsChainRow[],
  range: StatsRange
): { unit: 'week' | 'month'; bars: CollectedBar[] } {
  const weeks = Math.ceil((daysBetween(mondayOf(range.from), range.to) + 1) / 7)
  const unit = weeks > MAX_WEEK_BARS ? 'month' : 'week'
  const keyOf = unit === 'week' ? mondayOf : monthOf

  const bars = new Map<string, { start: string; end: string; days: number; full: boolean; paise: number }>()
  for (const date of datesIn(range)) {
    const key = keyOf(date)
    const bar = bars.get(key)
    if (bar) {
      bar.end = date
      bar.days++
    } else {
      bars.set(key, { start: date, end: date, days: 1, full: false, paise: 0 })
    }
  }
  for (const [key, bar] of bars) {
    bar.full = bar.days === (unit === 'week' ? 7 : daysInMonth(key))
  }
  for (const row of counted(rows)) {
    if (row.bookedDay < range.from || row.bookedDay > range.to) continue
    const bar = bars.get(keyOf(row.bookedDay))
    if (bar) bar.paise += collectedPaise(row)
  }

  return {
    unit,
    bars: [...bars.values()].map(({ paise, ...bar }) => ({ ...bar, collected: paise / 100 })),
  }
}

export interface StatsFunnel {
  checkoutsStarted: number
  paid: number
  completed: number
  /** Started and never paid: abandoned checkouts and unpaid pay-later bookings. */
  leftWithoutPaying: number
  /** Paid, but the booking could not be written; each one is owed back. */
  paidNoBooking: number
  /** What became of the paid bookings that are not completed. */
  cancelled: number
  noShows: number
  /** Paid, and neither done nor cancelled yet, whenever its slot was. */
  notDone: number
  paidOfStarted: number | null
  completedOfPaid: number | null
}

/** From checkout to a finished job, for the chains booked in the period. */
export function summariseFunnel(chains: StatsChainRow[], open: OpenCheckouts): StatsFunnel {
  const rows = counted(chains)
  const paid = rows.filter(isPaid)
  const outcomes = { completed: 0, cancelled: 0, no_show: 0, not_done: 0 }
  for (const row of paid) outcomes[outcomeOf(row)]++

  const checkoutsStarted = rows.length + open.pending + open.failed
  return {
    checkoutsStarted,
    paid: paid.length,
    completed: outcomes.completed,
    leftWithoutPaying: rows.length - paid.length + open.pending,
    paidNoBooking: open.failed,
    cancelled: outcomes.cancelled,
    noShows: outcomes.no_show,
    notDone: outcomes.not_done,
    paidOfStarted: ratio(paid.length, checkoutsStarted),
    completedOfPaid: ratio(outcomes.completed, paid.length),
  }
}

export interface StatsGarageRow {
  vendorId: string
  name: string
  bookings: number
  collected: number
  /** Average stars up to the period's end, one decimal; null with no reviews. */
  rating: number | null
  reviews: number
  /**
   * Paid bookings the garage did not accept in time, so the cron cancelled
   * and refunded them (0042). Counted among its cancellations too.
   */
  notAcceptedInTime: number
}

/** Every garage with a booking made in the period, most collected first. */
export function summariseGarages(
  rows: StatsChainRow[],
  ratings: Map<string, { average: number; count: number }>
): StatsGarageRow[] {
  const garages = new Map<string, { name: string; bookings: number; paise: number; missed: number }>()
  for (const row of counted(rows)) {
    if (!isPaid(row)) continue
    const garage = garages.get(row.vendorId) ?? { name: row.vendorName, bookings: 0, paise: 0, missed: 0 }
    garage.bookings++
    garage.paise += collectedPaise(row)
    if (row.responseMissed) garage.missed++
    garages.set(row.vendorId, garage)
  }

  return [...garages]
    .map(([vendorId, garage]) => {
      const rating = ratings.get(vendorId)
      return {
        vendorId,
        name: garage.name,
        bookings: garage.bookings,
        collected: garage.paise / 100,
        rating: rating ? Math.round(rating.average * 10) / 10 : null,
        reviews: rating?.count ?? 0,
        notAcceptedInTime: garage.missed,
      }
    })
    .sort((a, b) => b.collected - a.collected || b.bookings - a.bookings || a.name.localeCompare(b.name))
}

/** The categories the breakdown lists, in the order they are offered on the app. */
export const SERVICE_TYPES: ServiceCategory[] = [
  'car_wash',
  'detailing',
  'coating',
  'scratch_removal',
  'package',
  'others',
]

export interface StatsServiceRow {
  category: ServiceCategory
  /** Paid bookings with at least one service of this type. */
  bookings: number
  /** Their collected money, split across a booking's services by price. */
  collected: number
}

/**
 * Bookings and money by service type. A booking with two types of service
 * counts under both, so the counts can add up to more than the bookings; its
 * money is split between them by their prices, so the money adds up exactly.
 * Every type is listed, most collected first.
 */
export function summariseServiceTypes(
  rows: StatsChainRow[],
  items: Map<string, StatsItemRow[]>
): StatsServiceRow[] {
  const types = new Map(SERVICE_TYPES.map((category) => [category, { bookings: 0, paise: 0 }]))

  for (const row of counted(rows)) {
    if (!isPaid(row)) continue
    const lines = items.get(row.rootId) ?? []
    if (lines.length === 0) continue
    const total = lines.reduce((sum, line) => sum + toPaise(line.amount), 0)
    const collected = collectedPaise(row)

    // The last line takes what is left, so the rounded shares still add up
    // to the booking's money to the paisa.
    let given = 0
    const shares = new Map<ServiceCategory, number>()
    lines.forEach((line, index) => {
      const share =
        index === lines.length - 1
          ? collected - given
          : Math.round(collected * (total > 0 ? toPaise(line.amount) / total : 1 / lines.length))
      given += share
      shares.set(line.category, (shares.get(line.category) ?? 0) + share)
    })

    for (const [category, paise] of shares) {
      const type = types.get(category)
      if (!type) continue
      type.bookings++
      type.paise += paise
    }
  }

  return [...types]
    .map(([category, type]) => ({ category, bookings: type.bookings, collected: type.paise / 100 }))
    .sort(
      (a, b) =>
        b.collected - a.collected ||
        b.bookings - a.bookings ||
        SERVICE_TYPES.indexOf(a.category) - SERVICE_TYPES.indexOf(b.category)
    )
}

/** One cell of the busy-hours grid: ISO weekday (1 = Monday) and IST hour. */
export interface BusyHourCell {
  weekday: number
  hour: number
  bookings: number
}

/** The hours the grid always shows, 7 AM to 9 PM; wider when a slot falls outside them. */
export const BUSY_HOURS_FIRST = 7
export const BUSY_HOURS_LAST = 21

/**
 * The busy-hours grid: every weekday by every hour from the first to the
 * last shown, zeros included, so the page draws it without arithmetic.
 */
export function busyHoursGrid(cells: BusyHourCell[]): {
  firstHour: number
  lastHour: number
  cells: BusyHourCell[]
  total: number
} {
  const firstHour = Math.min(BUSY_HOURS_FIRST, ...cells.map((cell) => cell.hour))
  const lastHour = Math.max(BUSY_HOURS_LAST, ...cells.map((cell) => cell.hour))
  const counts = new Map(cells.map((cell) => [`${cell.weekday}:${cell.hour}`, cell.bookings]))

  const grid: BusyHourCell[] = []
  for (let weekday = 1; weekday <= 7; weekday++) {
    for (let hour = firstHour; hour <= lastHour; hour++) {
      grid.push({ weekday, hour, bookings: counts.get(`${weekday}:${hour}`) ?? 0 })
    }
  }
  return {
    firstHour,
    lastHour,
    cells: grid,
    total: cells.reduce((sum, cell) => sum + cell.bookings, 0),
  }
}
