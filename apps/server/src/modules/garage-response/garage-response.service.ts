import { AppError } from '../../lib/errors.js'
import { env } from '../../lib/env.js'
import { logger } from '../../lib/logger.js'
import { alertOps } from '../../lib/ops-alerts.js'
import { CITY_REACH_KM } from '../../lib/discovery.js'
import { CATEGORY_LABELS, type ServiceCategory } from '../../lib/categories.js'
import { addDays, istDateKey, istMidnight } from '../../lib/ist.js'
import {
  NOT_ACCEPTED_REASON,
  otherGaragesOrigin,
  wantedCategories,
} from '../../lib/response-deadline.js'
import type { BookingType } from '../../lib/booking-types.js'
import { linesDuration, linesForCategories, linesSubtotal } from '../../lib/booking-requests.js'
import type { NextFreeDay } from '../../lib/next-free.js'
import { isPickupOffered } from '../../lib/pickup.js'
import type { VehicleTier } from '../../lib/pricing.js'
import {
  RESCUE_RULES,
  garageRecord,
  rankRescue,
  rescueApplies,
  rescueDays,
  rescueReason,
  rescueTimes,
  usualAnswerMins,
  type RescueCandidate,
  type RescueReason,
} from '../../lib/rescue-garages.js'
import { addDaysToDateKey, istDayBounds } from '../../lib/slots.js'
import { ratingsFor } from '../reviews/reviews.service.js'
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
      // A free wash that covered it all (0062): nothing paid at all.
      nothingPaid: !!booking.payment && Number(booking.payment.amount) === 0 && Number(booking.payment.creditAmount ?? 0) === 0,
      // Only a free wash names a code there; an inspection with no fee
      // (0073) has none, and no free wash to give back.
      freeWash: !!booking.discountId,
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

/** What a rescue card adds to a garage's own list card. */
export interface RescueOffer {
  /** The same job for the same car at this garage, in rupees ("649.00"). */
  price: string
  /** That garage's services for it, to open the booking with them picked. */
  serviceIds: string[]
  /** "Usually answers in 10 min"; null with too little history or slower than an hour. */
  usualAnswerMins: number | null
  /** 'today', 'tomorrow' or the IST date of the times. */
  day: NextFreeDay
  /** Up to three ISO starts near the original slot, earliest first. */
  times: string[]
  /** The original slot when the times are on its day ("near 10:30 am"), else null. */
  near: string | null
}

export interface OtherGaragesResponse {
  /** The booking's type, carried into each garage's link. */
  bookingType: BookingType
  /** Why the card shows: the garage let its time run out, or declined. Null: no card. */
  reason: RescueReason | null
  /** Up to three of the garage list's own cards, best first, each with its offer. */
  items: Array<VendorListItemResponse & { rescue: RescueOffer }>
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
   * The rescue (lib/rescue-garages.ts): for a paid booking cancelled on the
   * garage's side (it let its time to answer run out, declined, cancelled or
   * did not show), up to three garages that can do the same services for the
   * same car, with free times near the original slot, ranked by distance,
   * how fast each usually answers, how often it accepts, its rating and its
   * recent cancellations. Candidates come from the garage list's own search
   * (LISTED_TO_CUSTOMERS, the doorstep and pickup reach rules, at least one
   * of the booked kinds of service), measured from the customer's address
   * for doorstep and pickup, or the garage's pin for a drop-in; the cards
   * are the list's own (vendorCardsFor). Only the booking's own customer;
   * anyone else gets a 404. Empty for any other booking, or with nowhere to
   * measure from. Read only: nothing here touches the refund.
   *
   * Reads one after the other: the API has a single connection.
   */
  async otherGarages(userId: string, bookingId: string, now = Date.now()): Promise<OtherGaragesResponse> {
    const booking = await bookingsRepository.findBookingById(bookingId)
    if (!booking || booking.userId !== userId) {
      throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
    }
    const bookingType = booking.bookingType as BookingType
    const applies = rescueApplies({
      status: booking.status,
      cancelledBy: booking.cancelledBy,
      cancelledOnBehalfOf: booking.cancelledOnBehalfOf,
      noShow: booking.noShow,
      responseMissedAt: booking.responseMissedAt,
    })
    const empty: OtherGaragesResponse = { bookingType, reason: null, items: [] }
    if (!applies) return empty
    const reason = rescueReason(booking)

    const origin = otherGaragesOrigin({
      bookingType,
      lat: booking.lat,
      lng: booking.lng,
      vendorLat: booking.vendor?.lat ?? null,
      vendorLng: booking.vendor?.lng ?? null,
    })
    // The price is for the booked car, and a time opens checkout on it
    // (`?car=`). A car the customer has since removed (archived) can't be
    // picked there, so checkout would price another car: no offer then.
    const vehicleType = booking.vehicle && !booking.vehicle.archivedAt
      ? (booking.vehicle.vehicleType as VehicleTier)
      : undefined
    if (!origin || !vehicleType) return { ...empty, reason }

    const categories = wantedCategories(await garageResponseRepository.bookedCategories(booking.id)).filter(
      (category): category is ServiceCategory => KNOWN_CATEGORIES.has(category)
    )
    if (categories.length === 0) return { ...empty, reason }

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
      limit: RESCUE_RULES.poolSize,
      offset: 0,
    })
    const ids = page.map((row) => row.id)
    if (ids.length === 0) return { ...empty, reason }

    const target = booking.scheduledAt
    const days = rescueDays(target, now)
    const first = days[0]!
    const last = days[days.length - 1]!
    const services = await garageResponseRepository.rescueServices(ids)
    const garages = await vendorsRepository.findPublicVendorsByIds(ids)
    const hours = await vendorsRepository.listWorkingHoursForVendors(ids)
    const closures = await vendorsRepository.listClosuresForVendors(ids, first, last)
    const busy = await bookingsRepository.listCapacityHoldersForVendors(
      ids,
      istDayBounds(addDaysToDateKey(first, -1)).start,
      istDayBounds(last).end
    )
    const recordRows = await garageResponseRepository.recordRows(
      ids,
      new Date(now - RESCUE_RULES.recordDays * 24 * 60 * 60 * 1000)
    )
    const ratings = await ratingsFor(ids)

    const distanceById = new Map(page.map((row) => [row.id, row.distanceM]))
    const candidates: RescueCandidate[] = []
    for (const garage of garages) {
      const offered =
        bookingType === 'dropin'
          ? garage.dropinEnabled
          : bookingType === 'doorstep'
            ? garage.doorstepEnabled
            : isPickupOffered(garage)
      const lines = linesForCategories(
        categories,
        services.filter((service) => service.vendorId === garage.id),
        vehicleType
      )
      const times =
        offered && lines
          ? rescueTimes(
              {
                pausedAt: garage.bookingsPausedAt,
                slotIntervalMins: garage.slotIntervalMins,
                bays: garage.bays,
                jobsPerDay: garage.jobsPerDay,
                hours: hours.filter((row) => row.vendorId === garage.id),
                closures: new Set(closures.filter((row) => row.vendorId === garage.id).map((row) => row.date)),
                busy: busy.filter((row) => row.vendorId === garage.id),
              },
              { durationMins: linesDuration(lines), bookingType },
              target,
              now
            )
          : null
      const distanceM = distanceById.get(garage.id) ?? null
      candidates.push({
        vendorId: garage.id,
        distanceKm: distanceM === null ? null : distanceM / 1000,
        rating: ratings.get(garage.id)?.rating ?? null,
        lines,
        times,
        record: garageRecord(
          recordRows.filter((row) => row.vendorId === garage.id),
          new Date(now)
        ),
      })
    }

    const ranked = rankRescue(candidates)
    if (ranked.length === 0) return { ...empty, reason }
    const cards = await vendorCardsFor(ranked.map((r) => ({ id: r.vendorId, distanceM: distanceById.get(r.vendorId) ?? null })))
    const cardById = new Map(cards.map((card) => [card.id, card]))
    const items = ranked.flatMap((r) => {
      const card = cardById.get(r.vendorId)
      if (!card) return []
      return [
        {
          ...card,
          rescue: {
            price: linesSubtotal(r.lines),
            serviceIds: r.lines.map((line) => line.serviceId),
            usualAnswerMins: usualAnswerMins(r.record),
            day: r.times.day,
            times: r.times.times,
            near: r.times.near,
          },
        },
      ]
    })
    return { bookingType, reason, items }
  },
}
