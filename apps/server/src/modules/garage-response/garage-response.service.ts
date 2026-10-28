import { AppError } from '../../lib/errors.js'
import { env } from '../../lib/env.js'
import { logger } from '../../lib/logger.js'
import { alertOps } from '../../lib/ops-alerts.js'
import { CITY_REACH_KM } from '../../lib/discovery.js'
import { CATEGORY_LABELS, type ServiceCategory } from '../../lib/categories.js'
import { addDays, istDateKey, istMidnight } from '../../lib/ist.js'
import {
  NOT_ACCEPTED_REASON,
  OTHER_GARAGES_LIMIT,
  otherGaragesOrigin,
  wantedCategories,
} from '../../lib/response-deadline.js'
import type { BookingType } from '../../lib/booking-types.js'
import { analyticsService } from '../analytics/analytics.service.js'
import { bookingsRepository } from '../bookings/bookings.repository.js'
import { refundsService } from '../refunds/refunds.service.js'
import { customerNotAcceptedInTime, garageNotAcceptedInTime } from '../../lib/push-messages.js'
import { pushService } from '../push/push.service.js'
import { slotAlertsService } from '../slot-alerts/slot-alerts.service.js'
import { vendorCardsFor, type VendorListItemResponse } from '../vendors/vendors.service.js'
import { vendorsRepository } from '../vendors/vendors.repository.js'
import { garageResponseRepository } from './garage-response.repository.js'
import { garageResponseWith } from './garage-response.rules.js'

const log = logger.child({ module: 'garage-response' })

/**
 * After the cron cancelled a booking as not accepted in time (0042): the
 * team is told (one Telegram alert per booking), the cancellation counted
 * as the garage's, and the paid booking refunded at once when AUTO_REFUNDS
 * is on — autoRefundCause reads it as 'garage_declined', a clear-cut case.
 */
async function afterCancel(bookingId: string) {
  const booking = await bookingsRepository.findBookingById(bookingId)
  if (!booking) return
  log.info({ bookingId, vendorId: booking.vendorId, respondBy: booking.respondBy }, 'garage_response:auto_cancelled')
  alertOps({ kind: 'not_accepted_in_time', booking, autoRefunds: env.autoRefunds })
  // Both sides hear it (0044): the customer that the refund is on its way,
  // the garage's team that the booking is gone.
  pushService.notifyCustomer(
    booking.userId,
    customerNotAcceptedInTime(booking, {
      paidWithCreditOnly: Number(booking.payment?.amount ?? 0) === 0 && Number(booking.payment?.creditAmount ?? 0) > 0,
    })
  )
  pushService.notifyGarage(booking.vendorId, garageNotAcceptedInTime(booking))
  analyticsService.bookingCancelled(bookingId, 'garage')
  if (booking.payment?.status === 'paid') refundsService.queueAutoRefund({ kind: 'booking', id: bookingId })
  // Its time is free again: anyone waiting for that day hears (0047).
  slotAlertsService.capacityFreed(booking, 'not_accepted_in_time')
}

const rules = garageResponseWith({
  store: {
    listOverdue: (now, limit) => garageResponseRepository.listOverdue(now, limit),
    async cancel(bookingId, at) {
      const [cancelled] = await bookingsRepository.cancelNotAcceptedInTime(bookingId, NOT_ACCEPTED_REASON, at)
      return Boolean(cancelled)
    },
  },
  enabled: env.autoCancelUnanswered,
  afterCancel,
  onError: (err, bookingId, step) => log.error({ err, bookingId, step }, 'garage_response:sweep_item_failed'),
})

const KNOWN_CATEGORIES = new Set(Object.keys(CATEGORY_LABELS))

export interface OtherGaragesResponse {
  /** The booking's type, carried into each garage's link. */
  bookingType: BookingType
  /** Up to three of the garage list's own cards, nearest first. */
  items: VendorListItemResponse[]
}

export const garageResponseService = {
  /** The pending-digest cron's auto-cancel (AUTO_CANCEL_UNANSWERED). */
  async sweep(options: { dryRun: boolean }, now = new Date()) {
    const summary = await rules.sweep(options, now)
    if (summary.enabled && summary.cancelled + summary.failed > 0) log.info(summary, 'garage_response:sweep')
    return summary
  },

  /**
   * Yesterday's (IST) auto-cancels per garage, for the 07:00 roll-up. Empty
   * while the switch is off and nothing was cancelled.
   */
  missedYesterday(now: Date) {
    const today = istDateKey(now)
    return garageResponseRepository.countMissedPerGarage(istMidnight(addDays(today, -1)), istMidnight(today))
  },

  /**
   * "Book another garage" for a booking its garage did not accept in time:
   * up to three nearby live garages that take the same booking type and
   * offer at least one of the booked services' categories, found by the
   * garage list's own search (LISTED_TO_CUSTOMERS, the doorstep and pickup
   * reach rules) from the customer's address for doorstep and pickup, or
   * the garage's pin for a drop-in, and built by its card builder
   * (vendorCardsFor). Only the booking's own customer; anyone else gets a
   * 404. Empty for any other booking, or with nowhere to measure from.
   */
  async otherGarages(userId: string, bookingId: string): Promise<OtherGaragesResponse> {
    const booking = await bookingsRepository.findBookingById(bookingId)
    if (!booking || booking.userId !== userId) {
      throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
    }
    const bookingType = booking.bookingType as BookingType
    const empty = { bookingType, items: [] }
    if (!booking.responseMissedAt) return empty

    const origin = otherGaragesOrigin({
      bookingType,
      lat: booking.lat,
      lng: booking.lng,
      vendorLat: booking.vendor?.lat ?? null,
      vendorLng: booking.vendor?.lng ?? null,
    })
    if (!origin) return empty

    const categories = wantedCategories(await garageResponseRepository.bookedCategories(booking.id)).filter(
      (category): category is ServiceCategory => KNOWN_CATEGORIES.has(category)
    )
    if (categories.length === 0) return empty

    const page = await vendorsRepository.listPublicVendorPage({
      origin,
      // Doorstep and pickup are bounded by each garage's own reach from its
      // pin; a drop-in by the list's usual radius.
      radiusM: bookingType === 'dropin' ? CITY_REACH_KM * 1000 : undefined,
      bookingType,
      anyCategory: categories,
      excludeIds: [booking.vendorId],
      sort: 'distance',
      segment: 'located',
      limit: OTHER_GARAGES_LIMIT,
      offset: 0,
    })
    return { bookingType, items: await vendorCardsFor(page) }
  },
}
