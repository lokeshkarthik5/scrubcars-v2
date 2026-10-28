/**
 * Detlio's commission: what Detlio would keep from each booking, for the
 * admin's Statistics only.
 *
 * Owner decisions, 16 Oct 2026:
 *
 * - 8% on car wash, package and "others" services; 5% on detailing, coating
 *   and scratch removal, the high-ticket work.
 * - Each garage's first 25 bookings are free. A booking counts towards the
 *   25 as soon as the garage received it — paid, or (an old pay-later
 *   booking) accepted — including bookings later cancelled or marked a
 *   no-show, in the order they were made. Bookings ops marked Test never
 *   count.
 * - From the 26th on, commission is taken on bookings that earn the garage a
 *   payout (lib/earnings.ts: a finished job, or a customer no-show), per
 *   booking item at that item's category rate, on the full price: before a
 *   Detlio-funded promo (Detlio pays for that, not the garage) and after a
 *   garage-funded discount (the garage never gets that money). That is the
 *   garage's own payout figure, computeVendorPayout. A paid final bill
 *   (inspection jobs) is charged at the rate of the booking's main service.
 *
 * Reporting only. Nothing here changes a payout, the earnings screen, a
 * receipt or anything a garage sees; it is a figure for the owner.
 *
 * A service may carry its own percent (0064, `services.commission_rate`,
 * 0–50%; owner decision 28 Oct 2026: "percent only"), which replaces its
 * category's rate for that service's lines and, as the main service, for a
 * final bill. Statistics pass it (`overrideRate`); the garage payouts never
 * do, so they keep charging the category rates. The free 25 apply either
 * way.
 *
 * Pure: the caller passes the rows. Money is rupee strings at rest and
 * integer paise in here, as lib/discounts.ts keeps it.
 */
import type { ServiceCategory } from './categories.js'
import { computeVendorPayout, type DiscountFundedBy } from './discounts.js'
import { earningKind } from './earnings.js'
import { wasAccepted } from './pilot-stats.js'

/**
 * The rate on each category. Keyed exhaustively, so a new category fails the
 * build here until someone decides what Detlio takes on it.
 */
export const COMMISSION_RATES: Record<ServiceCategory, number> = {
  car_wash: 0.08,
  package: 0.08,
  others: 0.08,
  detailing: 0.05,
  coating: 0.05,
  scratch_removal: 0.05,
}

/** Bookings each garage gets without commission. */
export const FREE_BOOKINGS = 25

/**
 * The rule as the Statistics page states it: each rate with its categories,
 * highest first, and the free bookings. From the table above, so the page can
 * never say one rate while the figures use another.
 */
export function commissionRules(): {
  rates: Array<{ rate: number; categories: ServiceCategory[] }>
  freeBookings: number
} {
  const byRate = new Map<number, ServiceCategory[]>()
  for (const [category, rate] of Object.entries(COMMISSION_RATES) as Array<[ServiceCategory, number]>) {
    byRate.set(rate, [...(byRate.get(rate) ?? []), category])
  }
  return {
    rates: [...byRate]
      .sort(([a], [b]) => b - a)
      .map(([rate, categories]) => ({ rate, categories })),
    freeBookings: FREE_BOOKINGS,
  }
}

/**
 * Payment statuses that mean the money landed at some point. A refunded
 * payment was paid first, so the booking still reached the garage.
 */
export const MONEY_LANDED_STATUSES = ['paid', 'collected', 'refunded'] as const

export function moneyLanded(paymentStatus: string | null | undefined): boolean {
  return (MONEY_LANDED_STATUSES as readonly string[]).includes(paymentStatus ?? '')
}

/** The facts that say whether a garage received a booking. */
export interface ReceivedFacts {
  status: string
  acceptedBy: string | null
  paymentStatus: string | null
}

/**
 * Whether the garage received this booking: its payment landed, or (an old
 * pay-later booking) the garage accepted it. Whatever happened next — a
 * cancellation, a refund, a no-show — it was received.
 */
export function wasReceived(chain: ReceivedFacts): boolean {
  return moneyLanded(chain.paymentStatus) || wasAccepted(chain)
}

/** A booking chain in a garage's queue for the free 25. */
export interface QueuedChain extends ReceivedFacts {
  rootId: string
  vendorId: string
  /** When the chain's first booking was written. */
  bookedAt: Date
  /** Marked Test by ops (0032): never one of the garage's bookings. */
  markedTest: boolean
  /**
   * A free redo (Detlio Guarantee, 0051): the same job again, not a new
   * booking, so it uses up none of the free 25. The reads leave redos out
   * already; this holds it for any other caller. Optional: absent is false.
   */
  guaranteeRedo?: boolean
}

/**
 * Each received chain's place in its garage's queue: 1 is the garage's first
 * booking. Ordered by when the booking was made, then by id so two written in
 * the same instant always come out the same way. Chains the garage never
 * received, and chains marked Test, have no place, so they use up none of
 * the free 25.
 */
export function queuePositions(chains: QueuedChain[]): Map<string, number> {
  const byGarage = new Map<string, QueuedChain[]>()
  for (const chain of chains) {
    if (chain.markedTest || chain.guaranteeRedo || !wasReceived(chain)) continue
    const queue = byGarage.get(chain.vendorId) ?? []
    queue.push(chain)
    byGarage.set(chain.vendorId, queue)
  }

  const positions = new Map<string, number>()
  for (const queue of byGarage.values()) {
    queue
      .sort(
        (a, b) =>
          a.bookedAt.getTime() - b.bookedAt.getTime() || (a.rootId < b.rootId ? -1 : 1)
      )
      .forEach((chain, index) => positions.set(chain.rootId, index + 1))
  }
  return positions
}

/** A service sold on a booking, with what commission needs of it. */
export interface CommissionItem {
  category: ServiceCategory
  /** The pre-discount line price, as booking_items keeps it. */
  amount: string
  pricingType?: string | null
  sortOrder: number
  /**
   * The service's own rate as a fraction (0.06 for 6%), when it has one
   * (0064). Statistics only: payouts leave it out. Absent or null is the
   * category's rate.
   */
  overrideRate?: number | null
}

/** The most a service's own rate may be: 50%, as the column's CHECK holds it. */
export const MAX_OVERRIDE_RATE = 0.5

/**
 * The rate one line is charged at: the service's own, when it has a valid
 * one, else its category's.
 */
export function itemRate(item: Pick<CommissionItem, 'category' | 'overrideRate'>): number {
  const own = item.overrideRate
  if (typeof own === 'number' && Number.isFinite(own) && own >= 0 && own <= MAX_OVERRIDE_RATE) return own
  return COMMISSION_RATES[item.category]
}

/** A service's stored percent ("6.50") as the fraction itemRate reads, or null. */
export function overrideRateFromPercent(percent: string | number | null | undefined): number | null {
  if (percent === null || percent === undefined || percent === '') return null
  const value = Number(percent)
  return Number.isFinite(value) && value >= 0 && value <= MAX_OVERRIDE_RATE * 100 ? value / 100 : null
}

/** A booking chain's latest row, with its money and items. */
export interface CommissionBooking {
  status: string
  noShow: 'customer' | 'garage' | null
  paymentStatus: string | null
  paymentRefunded: string | null
  amount: string
  subtotalAmount: string
  discountFundedBy: DiscountFundedBy | null
  items: CommissionItem[]
  /** Final bills paid in the app on the chain, added up. */
  billsPaid: string | null
  /** Refunded instead of redone (Detlio Guarantee, 0051). Optional: absent is false. */
  guaranteeRefund?: boolean
}

/** Whether the booking earns the garage its payout (lib/earnings.ts). */
export function earnsPayout(
  booking: Pick<CommissionBooking, 'status' | 'noShow' | 'paymentStatus' | 'paymentRefunded' | 'guaranteeRefund'>
): boolean {
  return (
    earningKind({
      status: booking.status,
      noShow: booking.noShow,
      payment: booking.paymentStatus
        ? { status: booking.paymentStatus, refundedAmount: booking.paymentRefunded }
        : null,
      guaranteeRefund: booking.guaranteeRefund,
    }) !== null
  )
}

/**
 * The service a final bill is charged at. A bill is only ever raised for an
 * inspection job, so it is the work that service quoted for: the first item
 * priced on inspection, or the booking's first item when (an older booking)
 * none says so.
 */
export function mainCategory(items: CommissionItem[]): ServiceCategory | null {
  return mainItem(items)?.category ?? null
}

/** The item a final bill is charged as (see mainCategory), or null. */
export function mainItem(items: CommissionItem[]): CommissionItem | null {
  const ordered = [...items].sort((a, b) => a.sortOrder - b.sortOrder)
  const inspected = ordered.find((item) => item.pricingType === 'on_inspection')
  return inspected ?? ordered[0] ?? null
}

function toPaise(rupees: string | null | undefined): number {
  const value = Number(rupees ?? 0)
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}

/**
 * Commission on one booking, in rupees, as if it were past the free 25.
 *
 * Each item is charged on its share of the garage's payout: its line price,
 * scaled down by a garage-funded discount and left whole under a Detlio-funded
 * one. The paise are rounded per item, so the figure is the sum of what each
 * line would show.
 */
export function bookingCommission(booking: CommissionBooking): number {
  const subtotal = toPaise(booking.subtotalAmount)
  const payout = toPaise(computeVendorPayout(booking))
  const share = subtotal > 0 ? payout / subtotal : 1

  let paise = 0
  for (const item of booking.items) {
    paise += Math.round(Math.round(toPaise(item.amount) * share) * itemRate(item))
  }

  const bill = toPaise(booking.billsPaid)
  const billItem = mainItem(booking.items)
  if (bill > 0 && billItem) {
    paise += Math.round(bill * itemRate(billItem))
  }
  return paise / 100
}

/**
 * Commission on a chain at its place in the garage's queue: nothing for the
 * first 25 (or a chain with no place, which the garage never received), and
 * nothing on a booking that earns the garage no payout.
 */
export function chainCommission(booking: CommissionBooking, position: number | undefined): number {
  if (position === undefined || position <= FREE_BOOKINGS) return 0
  if (!earnsPayout(booking)) return 0
  return bookingCommission(booking)
}

/** A garage past its free 25, with what it owes in the period. */
export interface CommissionActiveGarage {
  vendorId: string
  name: string
  /** Paid bookings made in the period. */
  bookings: number
  commission: number
  /** The day its 26th booking was made, when that was in the period. */
  activeSince: string | null
}

/** A garage still inside its free 25 at the end of the period. */
export interface CommissionFreeGarage {
  vendorId: string
  name: string
  /** Free bookings used so far: received bookings up to the period's end. */
  used: number
  left: number
}

/** A lifetime chain, as garageCommissionStatus needs it. */
export interface GarageQueueChain extends QueuedChain {
  vendorName: string
  /** The IST day the chain was booked, "YYYY-MM-DD". */
  bookedDay: string
}

/** A chain booked in the period, as garageCommissionStatus needs it. */
export interface PeriodChain {
  rootId: string
  vendorId: string
  paid: boolean
  commission: number
}

/**
 * Which garages pay commission and which are still in their free period, as
 * the period ends. `lifetime` is every chain booked up to the period's end;
 * `period` the chains booked inside it, with their commission worked out.
 * Garages that have never received a booking are in neither list.
 */
export function garageCommissionStatus(
  lifetime: GarageQueueChain[],
  period: PeriodChain[],
  range: { from: string; to: string }
): { active: CommissionActiveGarage[]; free: CommissionFreeGarage[] } {
  const positions = queuePositions(lifetime)
  const garages = new Map<string, { name: string; used: number; activeSince: string | null }>()
  for (const chain of lifetime) {
    const position = positions.get(chain.rootId)
    if (position === undefined) continue
    const garage = garages.get(chain.vendorId) ?? { name: chain.vendorName, used: 0, activeSince: null }
    garage.used++
    if (
      position === FREE_BOOKINGS + 1 &&
      chain.bookedDay >= range.from &&
      chain.bookedDay <= range.to
    ) {
      garage.activeSince = chain.bookedDay
    }
    garages.set(chain.vendorId, garage)
  }

  const inPeriod = new Map<string, { bookings: number; paise: number }>()
  for (const chain of period) {
    const figures = inPeriod.get(chain.vendorId) ?? { bookings: 0, paise: 0 }
    if (chain.paid) figures.bookings++
    figures.paise += Math.round(chain.commission * 100)
    inPeriod.set(chain.vendorId, figures)
  }

  const active: CommissionActiveGarage[] = []
  const free: CommissionFreeGarage[] = []
  for (const [vendorId, garage] of garages) {
    if (garage.used > FREE_BOOKINGS) {
      const figures = inPeriod.get(vendorId) ?? { bookings: 0, paise: 0 }
      active.push({
        vendorId,
        name: garage.name,
        bookings: figures.bookings,
        commission: figures.paise / 100,
        activeSince: garage.activeSince,
      })
    } else {
      free.push({ vendorId, name: garage.name, used: garage.used, left: FREE_BOOKINGS - garage.used })
    }
  }

  active.sort((a, b) => b.commission - a.commission || a.name.localeCompare(b.name))
  free.sort((a, b) => b.used - a.used || a.name.localeCompare(b.name))
  return { active, free }
}
