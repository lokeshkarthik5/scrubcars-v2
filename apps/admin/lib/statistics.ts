import type { ServiceCategory } from '@repo/core/types'
import type { StatsBreakdown, StatsFunnelMode, StatsFunnelReport } from '@repo/core/api/admin'
import { addDays, isWholeMonth, previousStatsRange, rangeDays } from '@repo/core/stats-range'
import { csvCell } from '@/lib/bookings'

/**
 * Wording, periods and small rules for the Statistics page. What each figure
 * counts is decided on the server (apps/server/src/lib/stats.ts); this only
 * picks the dates to ask for and says the answers.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

// ─── Periods ─────────────────────────────────────────────────────────────────

export const PERIODS = [
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'last90', label: 'Last 90 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
] as const

export type Period = (typeof PERIODS)[number]['value']

/** Thirty days steadies the pilot's small numbers enough to read a trend. */
export const DEFAULT_PERIOD: Period = 'last30'

export function isPeriod(value: string | null): value is Period {
  return PERIODS.some((period) => period.value === value)
}

export interface DateRange {
  from: string
  to: string
}

/** A period's dates, both included, ending today (India time) where it runs to now. */
export function periodRange(period: Period, today: string): DateRange {
  switch (period) {
    case 'last7':
      return { from: addDays(today, -6), to: today }
    case 'last30':
      return { from: addDays(today, -29), to: today }
    case 'last90':
      return { from: addDays(today, -89), to: today }
    case 'thisMonth':
      return { from: `${today.slice(0, 7)}-01`, to: today }
    case 'lastMonth': {
      const to = addDays(`${today.slice(0, 7)}-01`, -1)
      return { from: `${to.slice(0, 7)}-01`, to }
    }
  }
}

/** The Commission tab's months: this one and the eleven before, newest first. */
export function monthOptions(today: string): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = []
  let first = `${today.slice(0, 7)}-01`
  for (let i = 0; i < 12; i++) {
    const value = first.slice(0, 7)
    out.push({ value, label: `${MONTH_NAMES[Number(value.slice(5)) - 1]} ${value.slice(0, 4)}` })
    first = `${addDays(first, -1).slice(0, 7)}-01`
  }
  return out
}

/** A month's dates; the current one runs to today. */
export function monthRange(month: string, today: string): DateRange {
  const from = `${month}-01`
  const nextFirst = `${addDays(`${month}-28`, 4).slice(0, 7)}-01`
  const end = addDays(nextFirst, -1)
  return { from, to: end > today ? today : end }
}

/** "previous 30 days", or "September" for a whole month. */
export function comparedWith(range: DateRange): string {
  if (isWholeMonth(range)) {
    const previous = previousStatsRange(range)
    return MONTH_NAMES[Number(previous.from.slice(5, 7)) - 1]
  }
  const days = rangeDays(range)
  return days === 1 ? 'the day before' : `previous ${days} days`
}

/** The comparison's dates: "17 Sep – 16 Oct vs 18 Aug – 16 Sep". */
export function comparisonDates(range: DateRange): string {
  return `${rangeLabel(range)} vs ${rangeLabel(previousStatsRange(range))}`
}

// ─── The Funnel tab ──────────────────────────────────────────────────────────

/** The Funnel goes by the last 7, 30 or 90 days only: usage events are new. */
export const FUNNEL_PERIODS = PERIODS.filter(
  (period) => period.value === 'last7' || period.value === 'last30' || period.value === 'last90'
)

export type FunnelPeriod = 'last7' | 'last30' | 'last90'

/** The page's period as the Funnel reads it: a month falls back to 30 days. */
export function funnelPeriod(period: Period): FunnelPeriod {
  return period === 'last7' || period === 'last90' ? period : 'last30'
}

export const FUNNEL_MODES: ReadonlyArray<{ value: StatsFunnelMode; label: string }> = [
  { value: 'all', label: 'All booking types' },
  { value: 'dropin', label: 'At garage' },
  { value: 'doorstep', label: 'Doorstep' },
  { value: 'pickup', label: 'Pickup & drop' },
]

export function isFunnelMode(value: string | null): value is StatsFunnelMode {
  return FUNNEL_MODES.some((mode) => mode.value === value)
}

export const DEVICE_LABELS: Record<StatsFunnelReport['devices'][number]['device'], string> = {
  phone: 'Phone',
  tablet: 'Tablet',
  desktop: 'Desktop',
}

/**
 * What the page says about when usage events begin: they exist only from
 * the release that started recording them, so a period reaching back
 * further reads low on its early days. Null once the whole period has them.
 */
export function eventsStartNote(eventsSince: string | null, range: DateRange): string | null {
  if (eventsSince === null) {
    return 'No usage events yet. They are recorded from the release that added them, so this tab fills in from then on.'
  }
  if (eventsSince <= range.from) return null
  return `Usage events start on ${dayLabel(eventsSince)}, when recording began. Days before that have none, so the visit steps read low for this period.`
}

/** "Lost 90 here · 25% went on": the biggest drop's line, or null when nothing fell. */
export function biggestDropLine(funnel: StatsFunnelReport['funnel']): string | null {
  const drop = funnel.biggestDrop
  if (!drop) return null
  const went = drop.ofPrevious === null ? '' : ` · ${percent(drop.ofPrevious)} went on`
  return `Biggest drop: ${drop.lost.toLocaleString('en-IN')} lost before this step${went}`
}

/** "8 of 20 customers", or why there is no rate yet. */
export function returnWindowLine(window: StatsFunnelReport['returning']['windows'][number]): string {
  if (window.eligible === 0) return `Too recent to tell: no booking in the period is ${window.days} days old yet`
  return `${window.returned.toLocaleString('en-IN')} of ${plural(window.eligible, 'customer', 'customers')}`
}

// ─── Words for figures ───────────────────────────────────────────────────────

/** "17 Sep". */
export function dayLabel(date: string): string {
  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`
}

/** "17 Sep – 16 Oct", "17–20 Sep", or "17 Sep" for one day. */
export function rangeLabel(range: DateRange): string {
  if (range.from === range.to) return dayLabel(range.from)
  if (range.from.slice(0, 7) === range.to.slice(0, 7)) {
    return `${Number(range.from.slice(8, 10))}–${dayLabel(range.to)}`
  }
  return `${dayLabel(range.from)} – ${dayLabel(range.to)}`
}

/** "₹3,18,720": whole rupees, Indian grouping. */
export function rupees(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`
}

/** "₹740", "₹70.3k", "₹3.2L": short enough to sit above a bar. */
export function shortRupees(amount: number): string {
  if (Math.abs(amount) < 1000) return `₹${Math.round(amount)}`
  if (Math.abs(amount) < 100_000) return `₹${(amount / 1000).toFixed(1)}k`
  return `₹${(amount / 100_000).toFixed(1)}L`
}

/**
 * Up to this many bars, every bar carries its amount and its date. A phone's
 * card is about 300px wide: past seven bars (Last 90 days is 14 weeks) the
 * labels run into each other.
 */
export const LABEL_EVERY_BAR_UP_TO = 7

/**
 * Which bars carry their amount: all of them while they fit, then only the
 * first, the last and the highest, leaving the rest to the tooltip and the
 * chart's text summary.
 */
export function barsToLabel(amounts: number[]): Set<number> {
  if (amounts.length <= LABEL_EVERY_BAR_UP_TO) return new Set(amounts.map((_, i) => i))
  const highest = amounts.reduce((best, amount, i) => (amount > amounts[best] ? i : best), 0)
  return new Set([0, amounts.length - 1, highest])
}

/** "64%", or "6.6%" with one decimal; a dash with nothing to divide by. */
export function percent(rate: number | null, decimals = 0): string {
  return rate === null ? '–' : `${(rate * 100).toFixed(decimals)}%`
}

/** "1 booking", "2 bookings". */
export function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString('en-IN')} ${count === 1 ? one : many}`
}

/**
 * A tile's change from the period before: "↑ 18%" for counts and money, "↑ 4
 * pts" for rates, and whether that is good news. `better` says which way is
 * good — fewer cancellations is. Null when there is nothing to compare: no
 * earlier figure, or an earlier zero, where a percentage would be infinite.
 */
export function change(
  current: number | null,
  previous: number | null,
  kind: 'amount' | 'rate',
  better: 'up' | 'down' = 'up',
  decimals = 0
): { direction: 'up' | 'down' | 'same'; text: string; good: boolean | null } | null {
  if (current === null || previous === null) return null
  let size: number
  let unit: string
  if (kind === 'rate') {
    size = Number(((current - previous) * 100).toFixed(decimals))
    unit = ' pts'
  } else {
    if (previous === 0) return null
    size = Math.round((current / previous - 1) * 100)
    unit = '%'
  }
  if (size === 0) return { direction: 'same', text: 'no change', good: null }
  const direction = size > 0 ? 'up' : 'down'
  return {
    direction,
    text: `${Math.abs(size).toFixed(kind === 'rate' ? decimals : 0)}${unit}`,
    good: direction === better,
  }
}

// ─── Service types ───────────────────────────────────────────────────────────

/** The breakdown's names: plural for packages, as the customer app's chip says it. */
export const SERVICE_TYPE_LABELS: Record<ServiceCategory, string> = {
  car_wash: 'Car wash',
  detailing: 'Detailing',
  coating: 'Coating',
  scratch_removal: 'Scratch removal',
  package: 'Packages',
  others: 'Others',
}

/** "Car wash, packages and others": a commission rate's categories in a line. */
export function categoryList(categories: ServiceCategory[]): string {
  const names = categories.map((category, i) =>
    i === 0 ? SERVICE_TYPE_LABELS[category] : SERVICE_TYPE_LABELS[category].toLowerCase()
  )
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// ─── Busy hours ──────────────────────────────────────────────────────────────

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** "8 AM", "12 PM". */
export function hourLabel(hour: number): string {
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve} ${hour < 12 ? 'AM' : 'PM'}`
}

/**
 * A cell's shade, 0 (none) to 4 (the busiest), in quarters of the busiest
 * cell, so one busy Saturday does not wash every other cell out to nothing.
 */
export function heatLevel(bookings: number, busiest: number): 0 | 1 | 2 | 3 | 4 {
  if (bookings <= 0 || busiest <= 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((bookings / busiest) * 4))) as 1 | 2 | 3 | 4
}

/** The busiest slots, most first: "Sat 10 AM (12)". */
export function busiestSlots(cells: StatsBreakdown['busyHours']['cells'], count = 3): string[] {
  return [...cells]
    .filter((cell) => cell.bookings > 0)
    .sort((a, b) => b.bookings - a.bookings || a.weekday - b.weekday || a.hour - b.hour)
    .slice(0, count)
    .map((cell) => `${WEEKDAY_LABELS[cell.weekday - 1]} ${hourLabel(cell.hour)} (${cell.bookings})`)
}

/** The weekday with the most bookings in a run of days, or null on a tie or none. */
export function busiestWeekday(days: Array<{ date: string; bookings: number }>): string | null {
  const totals = new Array<number>(7).fill(0)
  for (const day of days) {
    // getUTCDay on a date key is its calendar weekday, 0 = Sunday.
    const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay()
    totals[(weekday + 6) % 7] += day.bookings
  }
  const most = Math.max(...totals)
  if (most === 0 || totals.filter((total) => total === most).length > 1) return null
  return ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'][
    totals.indexOf(most)
  ]
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

/**
 * The Breakdown tab as one CSV: the funnel, every garage, every service type
 * and every busy hour with a booking, a section per block. Built from the
 * figures already on screen, so the file says what the page says.
 */
export function breakdownCsv(breakdown: StatsBreakdown): string {
  const rows: Array<Array<string | number | null>> = [
    ['Section', 'Name', 'Bookings', 'Collected (₹)', 'Rating'],
    ['Period', rangeLabel(breakdown.range), null, null, null],
    ['Funnel', 'Checkout started', breakdown.funnel.checkoutsStarted, null, null],
    ['Funnel', 'Left without paying', breakdown.funnel.leftWithoutPaying, null, null],
    ['Funnel', 'Paid, no booking', breakdown.funnel.paidNoBooking, null, null],
    ['Funnel', 'Paid', breakdown.funnel.paid, null, null],
    ['Funnel', 'Cancelled', breakdown.funnel.cancelled, null, null],
    ['Funnel', 'No-show', breakdown.funnel.noShows, null, null],
    ['Funnel', 'Not marked done yet', breakdown.funnel.notDone, null, null],
    ['Funnel', 'Completed', breakdown.funnel.completed, null, null],
    ...breakdown.garages.map((garage) => [
      'Garage',
      garage.name,
      garage.bookings,
      garage.collected,
      garage.rating,
    ]),
    ...breakdown.services.map((service) => [
      'Service type',
      SERVICE_TYPE_LABELS[service.category],
      service.bookings,
      service.collected,
      null,
    ]),
    ...breakdown.busyHours.cells
      .filter((cell) => cell.bookings > 0)
      .map((cell) => [
        'Busy hours',
        `${WEEKDAY_LABELS[cell.weekday - 1]} ${hourLabel(cell.hour)}`,
        cell.bookings,
        null,
        null,
      ]),
  ]
  // CRLF is what RFC 4180 and Excel expect.
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}
