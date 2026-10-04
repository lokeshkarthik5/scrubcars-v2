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
   * cancelled, plus customer no-shows, where the policy keeps the payment.
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
 * in Razorpay and nothing marks the payment row 'refunded' afterwards, so a
 * declined or cancelled prepaid booking still reads 'paid' forever. The
 * booking's own status is what says the money is going back. A customer
 * no-show is the one cancellation that keeps the payment: the garage held
 * the slot.
 */
export function keptMoney(
  b: Pick<PilotBookingRow, 'status' | 'noShow' | 'paymentStatus'>
): boolean {
  if (!b.paymentStatus || !MONEY_IN.has(b.paymentStatus)) return false
  return b.status !== 'cancelled' || b.noShow === 'customer'
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

    if (keptMoney(b)) {
      const money = amount(b.paymentAmount)
      revenue += money

      const garage = garages.get(b.vendorId) ?? {
        vendorId: b.vendorId,
        name: b.vendorName,
        paidBookings: 0,
        revenue: 0,
      }
      garage.paidBookings++
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
