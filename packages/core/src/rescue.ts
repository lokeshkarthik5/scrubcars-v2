import { bookAgainPathFor } from './book-again'
import { formatClock, formatINR } from './format'
import { t } from './i18n/translate'
import { nextFreeDayLabel, type NextFree } from './next-free'
import type { Booking, BookingType } from './types'

/**
 * The rescue (Nov 2026): the best other garages when one doesn't answer,
 * under a booking cancelled on the garage's side. The ranking is the
 * server's (apps/server/src/lib/rescue-garages.ts); this is the words and the
 * links both customer apps show (apps/users other-garages-card.tsx and
 * apps/users-app components/booking/other-garages-card.tsx).
 */

/** What the card adds to a garage's own list card (GET /bookings/:id/other-garages). */
export interface RescueOffer {
  /** The same job for the same car at this garage, in rupees. */
  price: number
  /** That garage's services for it: a time opens the booking with them picked. */
  serviceIds: string[]
  /** "Usually answers in 10 min"; null when there is too little history. */
  usualAnswerMins: number | null
  /** The free times near the original slot, as the "Next free" row reads them. */
  free: NextFree
  /** The original slot when the times are on its day, else null. */
  near: string | null
}

export type RescueReason = 'not_accepted' | 'declined'

/**
 * Whether the booking page shows the card: cancelled on the garage's side
 * (it let its time to answer run out, declined, called it off after
 * accepting, or did not turn up), never the customer's own cancellation.
 * The server's rescueApplies is the rule; this only spares a request.
 */
export function showsRescue(
  booking: Pick<Booking, 'status' | 'cancelledBy' | 'cancelledOnBehalfOf' | 'noShow' | 'notAcceptedInTime'>
): boolean {
  if (booking.status !== 'cancelled') return false
  if (booking.notAcceptedInTime) return true
  if (booking.noShow === 'garage') return true
  if (booking.noShow === 'customer') return false
  if (booking.cancelledBy === 'vendor') return true
  return booking.cancelledBy === 'admin' && booking.cancelledOnBehalfOf === 'garage'
}

/**
 * The page's title for a booking the garage declined (the approved screen):
 * "Velan Car Care can't take this booking", with its reason in quotes under
 * it ("“No staff free for doorstep today.”"), then the refund line.
 */
export function garageDeclinedTitle(vendorName: string): string {
  return t("{vendorName} can't take this booking", { vendorName })
}

/** The garage's own words, quoted: they are its, not Detlio's. */
export function quotedGarageReason(reason: string): string {
  const text = reason.trim()
  return /^[“"]/.test(text) ? text : `“${text}”`
}

/** The card's heading. */
export function rescueHeading(): string {
  return t('These garages can do the same job')
}

/**
 * The line under it: what the job is, where, and how it works. "You pay
 * again as usual; your first payment is refunded." only when something was
 * paid (a no-fee inspection paid nothing).
 */
export function rescueSubline(input: { jobName: string; bookingType: BookingType; paid: boolean }): string {
  const job =
    input.bookingType === 'doorstep'
      ? t('{job}, at your address', { job: input.jobName })
      : input.bookingType === 'pickup'
        ? t('{job}, collected from your address', { job: input.jobName })
        : input.jobName
  const tap = t('{job} · tap a time to book.', { job })
  return input.paid ? `${tap} ${t('You pay again as usual; your first payment is refunded.')}` : tap
}

/** "Usually answers in 10 min", or null. */
export function usualAnswerLabel(mins: number | null): string | null {
  return mins === null ? null : t('Usually answers in {mins} min', { mins })
}

/** "Same job" and its price ("₹649"). */
export function sameJobPrice(price: number): string {
  return formatINR(price)
}

/**
 * The day part of the "Next free" row: "Today, near 10:30 am" when the times
 * are on the original slot's day, else the day alone ("Tomorrow").
 */
export function rescueDayLabel(offer: Pick<RescueOffer, 'free' | 'near'>, now: number = Date.now()): string {
  const day = t(nextFreeDayLabel(offer.free, now))
  return offer.near ? t('{day}, near {time}', { day, time: formatClock(offer.near) }) : day
}

/**
 * Where a time opens: the booking at that garage with the same job picked,
 * the same type, the address the first booking went to (doorstep and pickup)
 * and the time (`slot`, which checkout keeps if it is still free). The
 * customer pays as for any booking; the first payment's refund is untouched.
 */
export function rescueTimePath(input: {
  vendorId: string
  bookingType: BookingType
  serviceIds: string[]
  addressId?: string | null
  slot: string
}): string {
  const base = bookAgainPathFor({
    vendorId: input.vendorId,
    bookingType: input.bookingType,
    serviceIds: input.serviceIds,
    addressId: input.addressId,
  })
  return `${base}${base.includes('?') ? '&' : '?'}slot=${encodeURIComponent(input.slot)}`
}
