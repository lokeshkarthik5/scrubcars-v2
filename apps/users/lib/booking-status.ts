import type { HomeActionCard } from '@repo/core/api/home'
import type { StatusTone } from '@repo/core/status-tone'
import type { Booking } from '@repo/core/types'
import { formatClock, formatDay } from '@repo/core/format'

/**
 * What a booking page says first (F3): one plain line about where the
 * booking stands, a second with the time that matters, and which of the
 * four steps it is on. Pure, with the clock passed in, so it is unit-tested.
 *
 * The words are the app's status words (Waiting for garage → Accepted → In
 * progress → Done). "Confirmed" is never said while the garage has not
 * answered.
 */

/** The four steps of the thin bar, in order. */
export const STATUS_STEPS = [
  'Requested',
  'Accepted',
  'In progress',
  'Done',
] as const

export interface BookingHeadline {
  title: string
  detail: string | null
  /** Index into STATUS_STEPS, or null when the bar does not apply. */
  step: number | null
}

type HeadlineBooking = Pick<
  Booking,
  | 'status'
  | 'bookingType'
  | 'vendorName'
  | 'scheduledAtIso'
  | 'startedAtIso'
  | 'completedAtIso'
  | 'durationMins'
  | 'serviceSummary'
  | 'paymentStatus'
  | 'paymentMethod'
  | 'responseDeadline'
> & {
  vehicle?: Pick<NonNullable<Booking['vehicle']>, 'model'>
  timeProposal?: Booking['timeProposal']
}

/** "today at 9:00 am", "tomorrow at 9:00 am", "on Tue 20 Oct at 9:00 am". */
export function whenWords(at: string, now: number): string {
  const day = formatDay(at, now)
  const lead =
    day === 'Today' ? 'today' : day === 'Tomorrow' ? 'tomorrow' : `on ${day}`
  return `${lead} at ${formatClock(at)}`
}

/**
 * "tomorrow at 9:00 am", "Tue 20 Oct at 9:00 am" (no "on", for after
 * "for"), or clock first: "6:00 pm today", "6:00 pm on Tue 20 Oct".
 */
function dayWords(
  at: string,
  now: number,
  order: 'day-first' | 'clock-first' = 'day-first'
): string {
  const day = formatDay(at, now)
  const word = day === 'Today' ? 'today' : day === 'Tomorrow' ? 'tomorrow' : day
  if (order === 'clock-first')
    return `${formatClock(at)} ${word === day ? `on ${day}` : word}`
  return `${word} at ${formatClock(at)}`
}

export function bookingHeadline(
  booking: HeadlineBooking,
  now: number
): BookingHeadline {
  const car = booking.vehicle?.model ?? 'car'
  switch (booking.status) {
    case 'pending': {
      if (booking.timeProposal?.status === 'open') {
        return {
          title: `${booking.vendorName} can't do your time`,
          detail: 'Pick one of the times it suggested below.',
          step: 0,
        }
      }
      if (new Date(booking.scheduledAtIso).getTime() <= now) {
        return {
          title: `${booking.vendorName} didn't accept in time`,
          detail: null,
          step: null,
        }
      }
      if (
        booking.paymentMethod === 'online' &&
        booking.paymentStatus === 'pending'
      ) {
        return {
          title: 'Pay to send your request',
          detail: `Requested for ${dayWords(booking.scheduledAtIso, now)}. Your time isn't held until you pay.`,
          step: 0,
        }
      }
      const respondBy = booking.responseDeadline?.respondBy
      const answers =
        respondBy && Date.parse(respondBy) > now
          ? `They answer by ${dayWords(respondBy, now, 'clock-first')}. `
          : ''
      return {
        title: `Waiting for ${booking.vendorName} to accept`,
        detail: `${answers}Requested for ${dayWords(booking.scheduledAtIso, now)}.`,
        step: 0,
      }
    }
    case 'confirmed': {
      const when = whenWords(booking.scheduledAtIso, now)
      const title =
        booking.bookingType === 'doorstep'
          ? `Coming to you ${when}`
          : booking.bookingType === 'pickup'
            ? `Pickup ${when}`
            : `See you ${when}`
      return {
        title,
        detail: `${booking.vendorName} accepted your booking.`,
        step: 1,
      }
    }
    case 'in_progress': {
      const washing = /wash/i.test(booking.serviceSummary)
      const started = booking.startedAtIso
      const doneBy =
        started && booking.durationMins > 0
          ? new Date(
              new Date(started).getTime() + booking.durationMins * 60_000
            ).toISOString()
          : null
      return {
        title: washing ? 'Washing your car now' : 'Working on your car now',
        detail: started
          ? `Started ${formatClock(started)}${doneBy ? ` · done by about ${formatClock(doneBy)}` : ''}`
          : null,
        step: 2,
      }
    }
    case 'completed':
      return {
        title: `Your ${car} is done`,
        detail: booking.completedAtIso
          ? `${booking.vendorName} · ${formatDay(booking.completedAtIso, now)}`
          : booking.vendorName,
        step: 3,
      }
    case 'rescheduled':
      return { title: 'Moved to a new time', detail: null, step: null }
    default:
      return { title: 'Booking cancelled', detail: null, step: null }
  }
}

/**
 * A booking's chip in the customer's words, the same on the list and the
 * booking page: Waiting for garage → Accepted → In progress → Done. A
 * request the garage has not answered is grey, never the red "new" tone,
 * which is the garage's.
 */
export function customerStatusChip(status: Booking['status']): {
  label: string
  tone: StatusTone
} {
  switch (status) {
    case 'pending':
      return { label: 'Waiting for garage', tone: 'closed' }
    case 'confirmed':
      return { label: 'Accepted', tone: 'progress' }
    case 'in_progress':
      return { label: 'In progress', tone: 'progress' }
    case 'completed':
      return { label: 'Done', tone: 'done' }
    case 'rescheduled':
      return { label: 'Moved', tone: 'closed' }
    default:
      return { label: 'Cancelled', tone: 'closed' }
  }
}

/** "Garage answers by 6:00 pm today", from the booking's response deadline. */
export function answersByLine(respondBy: string, now: number): string {
  return `Garage answers by ${formatClock(respondBy)} ${whenDayWord(respondBy, now)}`
}

function whenDayWord(at: string, now: number): string {
  const day = formatDay(at, now)
  return day === 'Today'
    ? 'today'
    : day === 'Tomorrow'
      ? 'tomorrow'
      : `on ${day}`
}

/**
 * What the list says a booking needs from the customer (F3), from Updates'
 * to-do cards (the same reckoning as Home's must-act card), keyed by booking.
 */
export function actionsByBooking(
  todo: readonly HomeActionCard[] | undefined,
  money: (amount: string) => string
): Map<string, string> {
  const out = new Map<string, string>()
  for (const card of todo ?? []) {
    if (!('bookingId' in card) || out.has(card.bookingId)) continue
    switch (card.kind) {
      case 'extra_work_due':
        out.set(card.bookingId, `Approve extra work · ${money(card.amount)}`)
        break
      case 'bill_due':
        out.set(
          card.bookingId,
          `Pay your final bill · ${money(card.amountDue)}`
        )
        break
      case 'time_proposal':
        out.set(card.bookingId, 'Pick another time')
        break
      case 'garage_closed':
        out.set(card.bookingId, 'Garage closed that day')
        break
    }
  }
  return out
}
