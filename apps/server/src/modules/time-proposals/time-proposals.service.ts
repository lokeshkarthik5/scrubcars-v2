import { AppError } from '../../lib/errors.js'
import { env } from '../../lib/env.js'
import { logger } from '../../lib/logger.js'
import { alertOps } from '../../lib/ops-alerts.js'
import { getDateKeyFromScheduledAt, MIN_NOTICE_MS } from '../../lib/slots.js'
import { afterWithdraw } from '../../lib/response-deadline.js'
import type { BookingType } from '../../lib/booking-types.js'
import {
  PROPOSAL_DECLINED_REASON,
  PROPOSAL_EXPIRED_REASON,
  PROPOSAL_MIN_ANSWER_MS,
  PROPOSAL_MOVED_REASON,
  PROPOSAL_SWEEP_LIMIT,
  checkProposedSlots,
  pickRefusal,
  proposalRefusal,
  proposalSweepAction,
  type ProposalRefusal,
  type SlotsRefusal,
} from '../../lib/time-proposals.js'
import { analyticsService } from '../analytics/analytics.service.js'
import { bookingsRepository } from '../bookings/bookings.repository.js'
import {
  assertGarageCanAnswer,
  bookingsService,
  moveToSuggestedTime,
  toVendorBookingResponse,
} from '../bookings/bookings.service.js'
import { responseTimePassedError } from '../garage-response/garage-response.rules.js'
import { refundsService } from '../refunds/refunds.service.js'
import { jobSlots } from '../vendors/vendors.service.js'
import { timeProposalsRepository } from './time-proposals.repository.js'
import type { SuggestTimesInput } from './time-proposals.validation.js'

const log = logger.child({ module: 'time-proposals' })

type Booking = NonNullable<Awaited<ReturnType<typeof bookingsRepository.findBookingById>>>

function bookingNotFound() {
  return new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
}

/** The garage's words for why it can't suggest times on this booking now. */
function refusalError(refusal: ProposalRefusal) {
  switch (refusal) {
    case 'not_pending':
      return new AppError(
        400,
        'Other times can only be suggested for a booking you have not accepted yet.',
        'TIME_PROPOSAL_NOT_PENDING'
      )
    case 'not_paid':
      return new AppError(400, 'This booking has not been paid for yet', 'BOOKING_NOT_PAID')
    case 'already_open':
      return new AppError(
        409,
        'You have already suggested times for this booking. Withdraw them to suggest others.',
        'TIME_PROPOSAL_OPEN'
      )
  }
}

function slotsError(refusal: SlotsRefusal) {
  switch (refusal) {
    case 'none':
    case 'too_many':
    case 'invalid':
      return new AppError(400, 'Pick one to three times.', 'TIME_PROPOSAL_INVALID')
    case 'duplicate':
      return new AppError(400, 'Pick different times.', 'TIME_PROPOSAL_INVALID')
    case 'same_as_booked':
      return new AppError(
        400,
        'That is the time the customer booked. Accept the booking instead.',
        'TIME_PROPOSAL_INVALID'
      )
    case 'too_soon':
      return new AppError(
        400,
        'The soonest time is too close for the customer to answer in time. Pick a later one.',
        'TIME_PROPOSAL_TOO_SOON'
      )
  }
}

/** A suggested time that is no longer free (taken, or the day closed). */
function slotGone() {
  return new AppError(
    409,
    'That time was just taken. Pick one of the other times.',
    'TIME_PROPOSAL_SLOT_GONE'
  )
}

/** The suggestion was withdrawn, answered or ran out before this request. */
function proposalClosed() {
  return new AppError(
    409,
    'These times are no longer on offer. Refresh to see your booking.',
    'TIME_PROPOSAL_CLOSED'
  )
}

function stateChanged() {
  return new AppError(
    409,
    'This booking was just updated by someone else. Refresh to see its latest status.',
    'BOOKING_STATE_CHANGED'
  )
}

async function getBookingForGarage(vendorId: string, bookingId: string): Promise<Booking> {
  const booking = await bookingsRepository.findBookingById(bookingId)
  if (!booking || booking.vendorId !== vendorId) throw bookingNotFound()
  return booking
}

async function getBookingForCustomer(userId: string, bookingId: string): Promise<Booking> {
  const booking = await bookingsRepository.findBookingById(bookingId)
  if (!booking || booking.userId !== userId) throw bookingNotFound()
  return booking
}

function durationOf(booking: Booking): number {
  return booking.durationMins ?? (booking.items ?? []).reduce((total, item) => total + item.durationMins, 0)
}

/**
 * The garage's free times on one IST day for this same job: the slot list's
 * rule (vendors.service jobSlots) with the booking's own length and type,
 * and the booking itself left out so it does not count against itself.
 */
async function freeTimesOn(booking: Booking, date: string) {
  const vendor = await bookingsRepository.findVendorById(booking.vendorId)
  if (!vendor) throw bookingNotFound()
  return jobSlots(
    vendor,
    {
      date,
      bookingType: booking.bookingType,
      durationMins: durationOf(booking),
      serviceIds: (booking.items ?? []).map((item) => item.serviceId),
    },
    { excludeBookingId: booking.id }
  )
}

/** Whether `slot` is still one of the garage's free times for this job. */
async function stillFree(booking: Booking, slot: string): Promise<boolean> {
  const at = new Date(slot).getTime()
  const { slots } = await freeTimesOn(booking, getDateKeyFromScheduledAt(new Date(slot)))
  return slots.some((free) => new Date(free).getTime() === at)
}

/**
 * After a booking was cancelled because none of the suggested times was
 * taken (declined or run out): the team is told, the cancellation counted,
 * and a paid one refunded at once when AUTO_REFUNDS is on (it is the
 * garage's decline, autoRefundCause 'garage_declined').
 */
async function afterGarageSideCancel(bookingId: string, outcome: 'declined' | 'expired') {
  const updated = await bookingsRepository.findBookingById(bookingId)
  if (!updated) return
  alertOps({
    kind: 'time_proposal_outcome',
    outcome,
    booking: updated,
    previousScheduledAt: updated.scheduledAt,
  })
  analyticsService.bookingCancelled(bookingId, 'garage')
  if (updated.payment?.status === 'paid') refundsService.queueAutoRefund({ kind: 'booking', id: bookingId })
}

export const timeProposalsService = {
  /**
   * The garage's free times on a day for "Suggest another time": the same
   * list a customer moving this booking would get, without the booked time
   * itself, and without times so soon the customer could not answer in time.
   */
  async getSlots(vendorId: string, bookingId: string, date: string, now = Date.now()) {
    const booking = await getBookingForGarage(vendorId, bookingId)
    // Past the garage's time to answer (0042): nothing to suggest.
    assertGarageCanAnswer(booking, now)
    const open = await timeProposalsRepository.findOpen(booking.id)
    const refusal = proposalRefusal({
      status: booking.status,
      paymentStatus: booking.payment?.status,
      hasOpenProposal: open !== undefined,
    })
    if (refusal) throw refusalError(refusal)

    const result = await freeTimesOn(booking, date)
    const notice = MIN_NOTICE_MS[booking.bookingType as BookingType]
    return {
      ...result,
      slots: result.slots.filter((slot) => {
        const at = new Date(slot).getTime()
        return at !== booking.scheduledAt.getTime() && at - notice - now >= PROPOSAL_MIN_ANSWER_MS
      }),
    }
  },

  /**
   * "Suggest another time": one to three of the garage's own free times for
   * this booking, instead of declining it. Each is checked against the slot
   * list again here, so a time taken since the picker loaded is refused.
   */
  async suggest(
    vendorId: string,
    actorId: string,
    bookingId: string,
    input: SuggestTimesInput,
    now = Date.now()
  ) {
    const booking = await getBookingForGarage(vendorId, bookingId)
    // Suggesting times is an answer, so it is refused once the garage's
    // time to answer has run out (0042), like Accept.
    assertGarageCanAnswer(booking, now)
    const open = await timeProposalsRepository.findOpen(booking.id)
    const refusal = proposalRefusal({
      status: booking.status,
      paymentStatus: booking.payment?.status,
      hasOpenProposal: open !== undefined,
    })
    if (refusal) throw refusalError(refusal)

    const checked = checkProposedSlots(
      input.slots,
      { scheduledAt: booking.scheduledAt, bookingType: booking.bookingType },
      now
    )
    if (!checked.ok) throw slotsError(checked.refusal)

    // Each day's free times once, however many of the times fall on it.
    const byDay = new Map<string, Set<number>>()
    for (const slot of checked.slots) {
      const date = getDateKeyFromScheduledAt(new Date(slot))
      if (!byDay.has(date)) {
        const { slots } = await freeTimesOn(booking, date)
        byDay.set(date, new Set(slots.map((free) => new Date(free).getTime())))
      }
      if (!byDay.get(date)!.has(new Date(slot).getTime())) {
        throw new AppError(
          409,
          'One of those times is no longer free. Pick the times again.',
          'TIME_PROPOSAL_SLOT_GONE'
        )
      }
    }

    const result = await timeProposalsRepository.insertProposal({
      bookingId: booking.id,
      slots: checked.slots,
      note: input.note ?? null,
      expiresAt: checked.expiresAt,
      createdBy: actorId,
    }, env.autoCancelUnanswered ? { respondByAfter: new Date(now) } : {})
    if (result.kind === 'too_late') throw responseTimePassedError()
    if (result.kind === 'already_open') throw refusalError('already_open')
    if (result.kind === 'state_changed') throw stateChanged()

    log.info(
      { bookingId: booking.id, vendorId, actorId, proposalId: result.proposal.id, slots: checked.slots },
      'time_proposal:made'
    )
    alertOps({
      kind: 'time_proposal_made',
      booking,
      options: checked.slots.map((slot) => new Date(slot)),
      expiresAt: checked.expiresAt,
    })

    const updated = await bookingsRepository.findBookingById(booking.id)
    return toVendorBookingResponse(updated!)
  },

  /** The garage takes its suggestion back; the booking stays pending as it was. */
  async withdraw(vendorId: string, bookingId: string) {
    const booking = await getBookingForGarage(vendorId, bookingId)
    const open = await timeProposalsRepository.findOpen(booking.id)
    if (!open) throw proposalClosed()
    // Run out: the booking is being cancelled and refunded (the cron's
    // sweep), not handed back to the garage.
    if (open.expiresAt.getTime() <= Date.now()) {
      throw new AppError(
        409,
        "The customer didn't pick a time in time, so this booking is being cancelled and refunded.",
        'TIME_PROPOSAL_EXPIRED'
      )
    }

    // The booking waits for the garage's answer again: it keeps its
    // deadline, or gets at least 15 minutes from now to accept or decline
    // (0042, afterWithdraw), in the same transaction as the withdrawal.
    const at = new Date()
    const [withdrawn] = await bookingsRepository.withdrawProposal({
      proposalId: open.id,
      bookingId: booking.id,
      at,
      respondBy: afterWithdraw(booking.respondBy ?? null, booking.scheduledAt, at),
    })
    if (!withdrawn) throw proposalClosed()
    log.info({ bookingId: booking.id, vendorId, proposalId: open.id }, 'time_proposal:withdrawn')

    const updated = await bookingsRepository.findBookingById(booking.id)
    return toVendorBookingResponse(updated!)
  },

  /**
   * The customer picks one of the suggested times: the booking moves there
   * through the reschedule write, already accepted. Answers the new booking.
   */
  async choose(userId: string, bookingId: string, slot: string, now = Date.now()) {
    const booking = await getBookingForCustomer(userId, bookingId)
    const proposal = (await timeProposalsRepository.findOpen(booking.id)) ?? null

    const refusal = pickRefusal(proposal, booking.status, booking.bookingType, slot, now)
    if (refusal === 'not_open') throw proposalClosed()
    if (refusal === 'not_offered') {
      throw new AppError(400, "That isn't one of the times the garage suggested.", 'TIME_NOT_OFFERED')
    }
    if (refusal === 'too_soon') throw slotGone()

    // The cheap look first: a time another customer has taken since is
    // refused before any lock. The write checks again under the locks.
    if (!(await stillFree(booking, slot))) throw slotGone()

    const result = await moveToSuggestedTime(booking, new Date(slot), {
      id: proposal!.id,
      acceptedBy: proposal!.createdBy,
      reason: PROPOSAL_MOVED_REASON,
    })
    if (result.proposalGone) throw proposalClosed()
    if (result.stateChanged) throw stateChanged()
    if (result.garageRefusal) throw slotGone()
    if (result.vehicleClash) {
      throw new AppError(
        409,
        'Your car already has another booking that overlaps this time. Pick one of the other times.',
        'VEHICLE_DOUBLE_BOOKED'
      )
    }
    if (!result.booking) throw stateChanged()

    log.info(
      { userId, fromBookingId: booking.id, toBookingId: result.booking.id, proposalId: proposal!.id, slot },
      'time_proposal:chosen'
    )
    const moved = await bookingsRepository.findBookingById(result.booking.id)
    if (moved) {
      alertOps({
        kind: 'time_proposal_outcome',
        outcome: 'chosen',
        booking: moved,
        previousScheduledAt: booking.scheduledAt,
      })
    }
    return bookingsService.getBookingDetail(userId, result.booking.id)
  },

  /**
   * "None of these work": the booking is cancelled as the garage's decline,
   * so the payment is owed back in full (lib/refunds.ts) and the automatic
   * mode treats it like any garage decline. A suggestion just past its time
   * but not yet swept can still be answered this way; the outcome is the
   * same as the cron's.
   */
  async decline(userId: string, bookingId: string) {
    const booking = await getBookingForCustomer(userId, bookingId)
    const proposal = await timeProposalsRepository.findOpen(booking.id)
    if (!proposal || booking.status !== 'pending') throw proposalClosed()

    const [cancelled] = await bookingsRepository.cancelBooking(
      booking.id,
      'vendor',
      'pending',
      PROPOSAL_DECLINED_REASON,
      { proposalId: proposal.id, status: 'declined' }
    )
    if (!cancelled) throw proposalClosed()
    log.info({ userId, bookingId: booking.id, proposalId: proposal.id }, 'time_proposal:declined')

    await afterGarageSideCancel(booking.id, 'declined')
    return bookingsService.getBookingDetail(userId, booking.id)
  },

  /**
   * The pending-digest cron's sweep: suggestions that ran out unanswered
   * cancel their booking as the garage's decline; ones a booking left behind
   * (it was cancelled or moved some other way) are closed. At most
   * PROPOSAL_SWEEP_LIMIT a run, oldest first. A dry run only counts.
   */
  async sweep(options: { dryRun: boolean }, now = new Date()) {
    const rows = await timeProposalsRepository.listForSweep(now, PROPOSAL_SWEEP_LIMIT)
    const summary = { candidates: rows.length, expired: 0, closed: 0, skipped: 0, failed: 0 }
    if (options.dryRun) return summary

    for (const row of rows) {
      const action = proposalSweepAction(row, row.bookingStatus, now.getTime())
      try {
        if (action === 'expire') {
          const [cancelled] = await bookingsRepository.cancelBooking(
            row.bookingId,
            'vendor',
            'pending',
            PROPOSAL_EXPIRED_REASON,
            { proposalId: row.id, status: 'expired' }
          )
          if (!cancelled) {
            summary.skipped += 1
            continue
          }
          summary.expired += 1
          log.info({ bookingId: row.bookingId, proposalId: row.id }, 'time_proposal:expired')
          await afterGarageSideCancel(row.bookingId, 'expired')
        } else if (action === 'close') {
          const [closed] = await timeProposalsRepository.close(row.id, now)
          if (closed) summary.closed += 1
          else summary.skipped += 1
        } else {
          summary.skipped += 1
        }
      } catch (err) {
        summary.failed += 1
        log.error({ err, proposalId: row.id, bookingId: row.bookingId }, 'time_proposal:sweep_item_failed')
      }
    }
    if (summary.expired + summary.closed + summary.failed > 0) log.info(summary, 'time_proposal:sweep')
    return summary
  },
}
