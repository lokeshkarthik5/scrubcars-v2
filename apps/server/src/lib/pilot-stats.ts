/**
 * The pilot's numbers: how many people started checkout, paid, got accepted
 * and got their car done, and where it went wrong when it did.
 *
 * Worked out here from slim rows the admin repository reads, rather than in
 * SQL, so every definition below is one readable rule with a test. At pilot
 * volume a 30-day window is a few hundred rows; when it is tens of thousands,
 * this moves into GROUP BY queries with the same definitions.
 *
 * Pure and clock-free: the caller decides the window and passes its rows.
 */

/** A checkout, as booking_intents records it. */
export interface PilotIntentRow {
  status: 'pending' | 'consumed' | 'failed'
}

/** A booking in the window, with the facts each count needs. */
export interface PilotBookingRow {
  id: string
  /** The booking this one replaced, when it was written by a reschedule. */
  rescheduledFromId: string | null
  vendorId: string
  vendorName: string
  status: string
  acceptedBy: string | null
  cancelledBy: 'user' | 'vendor' | 'admin' | null
  cancelledOnBehalfOf: 'customer' | 'garage' | 'detlio' | null
  noShow: 'customer' | 'garage' | null
  paymentStatus: string | null
  paymentAmount: string | null
  /** What has been refunded of the booking's payment so far (0029). */
  paymentRefunded?: string | null
  /**
   * Money paid in the app after checkout (final bills of inspection jobs),
   * summed. Null or '0.00' when there was none.
   */
  chargesPaid: string | null
  /** What has been refunded of those bills so far. */
  chargesRefunded?: string | null
}

export interface PilotGarage {
  vendorId: string
  name: string
  paidBookings: number
  revenue: number
}

export interface PilotStats {
  /** Checkouts opened: a booking intent was priced and a Razorpay order made. */
  checkoutsStarted: number
  /** Checkouts whose payment landed and became a booking. */
  paid: number
  /** Money taken with no booking to show for it: each one is a refund to do. */
  paidNoBooking: number
  /** Bookings a garage accepted, whatever happened to them afterwards. */
  accepted: number
  completed: number
  cancelledByCustomer: number
  cancelledByGarage: number
  cancelledByDetlio: number
  customerNoShows: number
  garageNoShows: number
  /**
   * Rupees Detlio keeps: paid (or cash-collected) bookings that were not
   * cancelled, plus customer no-shows, where the policy keeps the payment,
   * plus final bills paid in the app on bookings that were not cancelled —
   * each less anything refunded on it.
   */
  revenue: number
  /** Ratios between 0 and 1, or null when there is nothing to divide by. */
  rates: {
    paidOfStarted: number | null
    acceptedOfPaid: number | null
    completedOfAccepted: number | null
  }
  topGarages: PilotGarage[]
}

const ACCEPTED_STATUSES = new Set(['confirmed', 'in_progress', 'completed'])
const MONEY_IN = new Set(['paid', 'collected'])
const TOP_GARAGES = 5

/** Fewer accepts than this and the median is reported as not enough data. */
export const MIN_ACCEPT_SAMPLES = 3

/** A booking a garage accepted, with what the accept time is measured from. */
export interface PilotAcceptRow {
  /** When the booking row was written. */
  createdAt: Date
  /** When its payment landed; null while unpaid. */
  paidAt: Date | null
  /** When the garage accepted it; null if it never did, or did before 0028. */
  acceptedAt: Date | null
}

/**
 * How fast garages accept: the median minutes from a booking reaching the
 * garage to the garage accepting it, and how many accepts that is over. The
 * median is null under MIN_ACCEPT_SAMPLES — a median of two is an anecdote.
 */
export interface PilotAcceptTime {
  medianAcceptMins: number | null
  acceptSamples: number
}

/**
 * Accepted means a garage said yes. `accepted_by` records that from the team
 * model onwards; an older booking that reached confirmed or beyond was
 * accepted too, it just does not say by whom. A booking accepted and later
 * cancelled (a no-show, a late cancel) still counts: it was accepted.
 */
export function wasAccepted(b: Pick<PilotBookingRow, 'status' | 'acceptedBy'>): boolean {
  return b.acceptedBy !== null || ACCEPTED_STATUSES.has(b.status)
}

/**
 * Whose cancellation it was. A no-show is not a cancellation by anyone — it is
 * counted on its own — and an admin cancellation counts for whoever ops was
 * acting for.
 */
export function cancelledBy(
  b: Pick<PilotBookingRow, 'status' | 'cancelledBy' | 'cancelledOnBehalfOf' | 'noShow'>
): 'customer' | 'garage' | 'detlio' | null {
  if (b.status !== 'cancelled' || b.noShow) return null
  if (b.cancelledBy === 'user') return 'customer'
  if (b.cancelledBy === 'vendor') return 'garage'
  if (b.cancelledBy === 'admin') return b.cancelledOnBehalfOf ?? 'detlio'
  return null
}

/**
 * Whether the money on this booking stays with us. Refunds are done by hand
 * in Razorpay, and a cancelled prepaid booking reads 'paid' until ops records
 * the refund (and 'paid' for good if nobody does), so the booking's own
 * status is what says the money is going back. A customer no-show is the one
 * cancellation that keeps the payment: the garage held the slot.
 */
export function keptMoney(
  b: Pick<PilotBookingRow, 'status' | 'noShow' | 'paymentStatus'>
): boolean {
  if (!b.paymentStatus || !MONEY_IN.has(b.paymentStatus)) return false
  return b.status !== 'cancelled' || b.noShow === 'customer'
}

/**
 * Minutes from a booking reaching the garage to the garage accepting it.
 *
 * The clock starts at the later of payment and the booking's own creation:
 * a booking paid at checkout is written the moment the money lands, an old
 * pay-later one reaches the garage when it is paid, and a rescheduled one
 * carries its original payment but only reaches the garage when it is
 * written. Null when it was never accepted (or was before accepted_at
 * existed), or never paid.
 */
export function acceptMinutes(b: PilotAcceptRow): number | null {
  if (!b.acceptedAt || !b.paidAt) return null
  const reached = Math.max(b.paidAt.getTime(), b.createdAt.getTime())
  return Math.max(0, (b.acceptedAt.getTime() - reached) / 60_000)
}

/**
 * The median accept time over bookings the garage accepted on or after
 * `since`, rounded to the minute. The window is on the accept, not on when
 * the booking was made: this measures how fast garages answer now. Every
 * accept counts — a booking accepted and then moved by the customer still
 * measured how fast its garage answered.
 */
export function summariseAcceptTime(rows: PilotAcceptRow[], since: Date): PilotAcceptTime {
  const minutes = rows
    .filter((b) => b.acceptedAt !== null && b.acceptedAt.getTime() >= since.getTime())
    .map(acceptMinutes)
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b)

  if (minutes.length < MIN_ACCEPT_SAMPLES) {
    return { medianAcceptMins: null, acceptSamples: minutes.length }
  }

  const mid = Math.floor(minutes.length / 2)
  const median =
    minutes.length % 2 === 1 ? minutes[mid] : (minutes[mid - 1] + minutes[mid]) / 2
  return { medianAcceptMins: Math.round(median), acceptSamples: minutes.length }
}

function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null
}

function amount(raw: string | null): number {
  const value = Number(raw)
  return Number.isFinite(value) ? value : 0
}

/**
 * The numbers for one window.
 *
 * A reschedule does not edit the booking: it writes a new row, copies the
 * payment onto it (still 'paid'), and cancels the old row as if the customer
 * had cancelled it. Counting both would count one car twice, add its money
 * twice and call the move a customer cancellation. So only the latest row of
 * each chain counts — any row another row was rescheduled from is skipped.
 * `bookings` must hold whole chains for that to work, which is why the
 * repository windows a chain on its first booking's created_at.
 */
export function summarisePilot(intents: PilotIntentRow[], allBookings: PilotBookingRow[]): PilotStats {
  const checkoutsStarted = intents.length
  const paid = intents.filter((i) => i.status === 'consumed').length
  const paidNoBooking = intents.filter((i) => i.status === 'failed').length

  let accepted = 0
  let completed = 0
  let revenue = 0
  const cancelled = { customer: 0, garage: 0, detlio: 0 }
  const noShows = { customer: 0, garage: 0 }
  const garages = new Map<string, PilotGarage>()

  const replaced = new Set(allBookings.map((b) => b.rescheduledFromId).filter(Boolean))
  const bookings = allBookings.filter((b) => !replaced.has(b.id))

  for (const b of bookings) {
    if (wasAccepted(b)) accepted++
    if (b.status === 'completed') completed++

    const by = cancelledBy(b)
    if (by) cancelled[by]++
    if (b.noShow) noShows[b.noShow]++

    // Final bills paid in the app are kept unless the booking was cancelled,
    // when the team refunds them along with the rest. Whatever was refunded
    // of what is kept comes off: kept is paid less refunded.
    const charges =
      b.status === 'cancelled'
        ? 0
        : Math.max(0, amount(b.chargesPaid) - amount(b.chargesRefunded ?? null))

    const kept = keptMoney(b)
    if (kept || charges > 0) {
      const payment = kept
        ? Math.max(0, amount(b.paymentAmount) - amount(b.paymentRefunded ?? null))
        : 0
      const money = payment + charges
      revenue += money

      const garage = garages.get(b.vendorId) ?? {
        vendorId: b.vendorId,
        name: b.vendorName,
        paidBookings: 0,
        revenue: 0,
      }
      if (kept) garage.paidBookings++
      garage.revenue += money
      garages.set(b.vendorId, garage)
    }
  }

  const topGarages = [...garages.values()]
    .sort(
      (a, b) =>
        b.paidBookings - a.paidBookings || b.revenue - a.revenue || a.name.localeCompare(b.name)
    )
    .slice(0, TOP_GARAGES)
    .map((g) => ({ ...g, revenue: round2(g.revenue) }))

  return {
    checkoutsStarted,
    paid,
    paidNoBooking,
    accepted,
    completed,
    cancelledByCustomer: cancelled.customer,
    cancelledByGarage: cancelled.garage,
    cancelledByDetlio: cancelled.detlio,
    customerNoShows: noShows.customer,
    garageNoShows: noShows.garage,
    revenue: round2(revenue),
    rates: {
      paidOfStarted: ratio(paid, checkoutsStarted),
      acceptedOfPaid: ratio(accepted, paid),
      completedOfAccepted: ratio(completed, accepted),
    },
    topGarages,
  }
}

// Paise, not floating-point dust: ₹499.00 + ₹0.10 must not read ₹499.0999….
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** What is still to refund, and what was refunded in the window. */
export interface PilotRefunds {
  /** Refunds still to do, whenever they became owed: a to-do list, not a window. */
  refundsOwed: number
  refundsOwedAmount: number
  /** Refunds recorded in the window, and how much they came to. */
  refunded: number
  refundedAmount: number
}

/**
 * The refunds figures for the pilot card. `owed` is every item still owed
 * (from the refunds list, so the two always agree); `recorded` is every item
 * whose latest refund was recorded in the window, with what has been refunded
 * on it in all. An item refunded in parts across the window's edge counts
 * all of it — at pilot volume a rare case, and an over- rather than an
 * under-count.
 */
export function summariseRefunds(
  owed: Array<{ amountOwed: string }>,
  recorded: Array<{ refundedAmount: string | null }>
): PilotRefunds {
  return {
    refundsOwed: owed.length,
    refundsOwedAmount: round2(owed.reduce((total, item) => total + amount(item.amountOwed), 0)),
    refunded: recorded.length,
    refundedAmount: round2(recorded.reduce((total, row) => total + amount(row.refundedAmount), 0)),
  }
}
