/**
 * A car's history (idea #13): every job done on one of the customer's cars,
 * newest first, with what it cost them. Pure, with the clock passed in;
 * modules/car-history reads the rows and lib/service-reminders.ts adds the
 * follow-ups.
 *
 * - **One entry per booking, not per row.** A reschedule writes a new row and
 *   retires the old one as cancelled (`rescheduled_from_id`), so a booking is
 *   its chain (`coalesce(original_booking_id, id)`), and the chain's latest
 *   row (the highest `reschedule_count`, then the newest) says how it ended
 *   and is the one its page, receipt and photos hang on, as Statistics reads
 *   it (lib/stats.ts).
 * - **Only completed jobs are history.** A chain whose latest row is
 *   cancelled (by anyone, a no-show of either side included) never touched
 *   the car; it is counted (`cancelledCount`) so the page can point to My
 *   bookings, where it lives with its refund. Jobs still to happen or under
 *   way are not history yet.
 * - **Amount paid** is what the customer paid for the job and kept paying:
 *   the latest row's payment (paid, collected, or refunded since; its
 *   Razorpay part plus any Detlio credit part not given back, 0049) less what
 *   was refunded on it, plus the paid final bill and extra work on it less
 *   their refunds (`charges_paid`, net in SQL). A reschedule copies the
 *   payment to the new row, so only the latest row's is counted; the old
 *   row's copy is the same money.
 * - **Totals** over the entries shown (after the filter): washes this year
 *   (every job is a "wash" in the app's words, as Rate your wash asks of
 *   any job) and money spent this year, by the job's IST date, plus all-time.
 */
import { istDateKey, istParts } from './ist.js'
import type { ServiceCategory } from './categories.js'

/** One booking row of the car, as the repository reads it. */
export interface CarHistoryRow {
  id: string
  /** `coalesce(original_booking_id, id)`. */
  chainId: string
  rescheduleCount: number
  createdAt: Date
  status: string
  scheduledAt: Date
  completedAt: Date | null
  bookingType: string
  vendorId: string
  vendorName: string
  /** The services as booked, in order; a package with its own category. */
  items: Array<{ name: string; category: string }>
  /** The categories of the packages' members, if any package was booked. */
  packageCategories: string[]
  payment: { amount: string; status: string; refundedAmount: string | null } | null
  /** Paid final bill and extra work on this row, less their refunds. */
  chargesPaid: string
  photos: { before: number; after: number }
}

export interface CarHistoryItem {
  /** The latest row of the chain: its page, receipt and photos. */
  bookingId: string
  /** When the job was finished (its slot for a job from before completion times). */
  doneAt: string
  bookingType: string
  vendorId: string
  vendorName: string
  services: Array<{ name: string; category: string }>
  /** Every category the job covered, a package standing for its members; for the filter. */
  categories: ServiceCategory[]
  /** "800.00". */
  amountPaid: string
  receiptAvailable: boolean
  photos: { before: number; after: number }
}

export interface CarHistoryTotals {
  washesThisYear: number
  spentThisYear: string
  washesTotal: number
  spentTotal: string
  /** The first job's date ("YYYY-MM-DD"), null with none. */
  since: string | null
}

export interface CarHistory {
  items: CarHistoryItem[]
  totals: CarHistoryTotals
  /** Categories with at least one job, for the filter chips; in CATEGORY_ORDER. */
  categories: ServiceCategory[]
  /** Bookings for this car that ended cancelled: not listed (My bookings has them). */
  cancelledCount: number
}

/** The filter chips' order: the most common first. Packages count as their members. */
export const CATEGORY_ORDER: readonly ServiceCategory[] = [
  'car_wash',
  'detailing',
  'coating',
  'scratch_removal',
  'others',
  'package',
]

/** A payment that went through and was not voided (refunds are taken off separately). */
const PAID_PAYMENT = new Set(['paid', 'collected', 'refunded'])

const toPaise = (amount: string | null | undefined) => Math.round(Number(amount ?? 0) * 100)
const fromPaise = (paise: number) => (paise / 100).toFixed(2)

/**
 * Each chain's latest row: the highest reschedule count, then the newest.
 * Also read by the Service History certificate (0053), so it takes any row
 * that names its chain.
 */
export function latestOfChains<Row extends Pick<CarHistoryRow, 'chainId' | 'rescheduleCount' | 'createdAt'>>(
  rows: Row[]
): Row[] {
  const latest = new Map<string, Row>()
  for (const row of rows) {
    const held = latest.get(row.chainId)
    if (
      !held ||
      row.rescheduleCount > held.rescheduleCount ||
      (row.rescheduleCount === held.rescheduleCount && row.createdAt.getTime() > held.createdAt.getTime())
    ) {
      latest.set(row.chainId, row)
    }
  }
  return [...latest.values()]
}

/** What the customer paid for the job and kept paid, in rupees ("800.00"). */
export function amountPaidOf(row: Pick<CarHistoryRow, 'payment' | 'chargesPaid'>): string {
  const payment =
    row.payment && PAID_PAYMENT.has(row.payment.status)
      ? Math.max(0, toPaise(row.payment.amount) - toPaise(row.payment.refundedAmount))
      : 0
  return fromPaise(payment + Math.max(0, toPaise(row.chargesPaid)))
}

/** Every category a job covered: its items', with a package standing for its members too. */
export function categoriesOf(row: Pick<CarHistoryRow, 'items' | 'packageCategories'>): ServiceCategory[] {
  const set = new Set<string>([...row.items.map((item) => item.category), ...row.packageCategories])
  return CATEGORY_ORDER.filter((category) => set.has(category))
}

/** When the job was done. */
function doneAt(row: Pick<CarHistoryRow, 'completedAt' | 'scheduledAt'>): Date {
  return row.completedAt ?? row.scheduledAt
}

/**
 * The car's history: its completed jobs newest first (one per chain),
 * filtered to a category if asked, with the totals of what is shown.
 */
export function buildCarHistory(
  rows: CarHistoryRow[],
  options: { now: Date; category?: ServiceCategory | null }
): CarHistory {
  const chains = latestOfChains(rows)
  const completed = chains
    .filter((row) => row.status === 'completed')
    .sort((a, b) => doneAt(b).getTime() - doneAt(a).getTime() || b.id.localeCompare(a.id))
  const cancelledCount = chains.filter((row) => row.status === 'cancelled').length

  const all: CarHistoryItem[] = completed.map((row) => ({
    bookingId: row.id,
    doneAt: doneAt(row).toISOString(),
    bookingType: row.bookingType,
    vendorId: row.vendorId,
    vendorName: row.vendorName,
    services: row.items,
    categories: categoriesOf(row),
    amountPaid: amountPaidOf(row),
    receiptAvailable: !!row.payment && PAID_PAYMENT.has(row.payment.status),
    photos: row.photos,
  }))
  const present = new Set(all.flatMap((item) => item.categories))
  const category = options.category ?? null
  const items = category ? all.filter((item) => item.categories.includes(category)) : all

  const year = istParts(options.now).year
  const thisYear = items.filter((item) => istParts(new Date(item.doneAt)).year === year)
  const sum = (list: CarHistoryItem[]) => fromPaise(list.reduce((total, item) => total + toPaise(item.amountPaid), 0))
  const oldest = items[items.length - 1]

  return {
    items,
    totals: {
      washesThisYear: thisYear.length,
      spentThisYear: sum(thisYear),
      washesTotal: items.length,
      spentTotal: sum(items),
      since: oldest ? istDateKey(new Date(oldest.doneAt)) : null,
    },
    categories: CATEGORY_ORDER.filter((c) => present.has(c)),
    cancelledCount,
  }
}
