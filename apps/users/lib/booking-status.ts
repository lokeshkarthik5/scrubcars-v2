import type { HomeActionCard } from '@repo/core/api/home'
import type { StatusTone } from '@repo/core/status-tone'
import type { Booking } from '@repo/core/types'
import { formatClock, formatDay } from '@repo/core/format'
import { msg, t } from '@repo/core/i18n/translate'

/**
 * What a booking page says first (F3): one plain line about where the
 * booking stands, a second with the time that matters, and which of the
 * four steps it is on. Pure, with the clock passed in, so it is unit-tested.
 *
 * The words are the app's status words (Waiting for garage → Accepted → In
 * progress → Done). "Confirmed" is never said while the garage has not
 * answered. Each line is in the language chosen (t); the steps are
 * translated where the bar shows them (statusStops).
 */

/** The four steps of the thin bar, in order. */
export const STATUS_STEPS = [
  msg('Requested'),
  msg('Accepted'),
  msg('In progress'),
  msg('Done'),
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
  const time = formatClock(at)
  return day === 'Today'
    ? t('today at {time}', { time })
    : day === 'Tomorrow'
      ? t('tomorrow at {time}', { time })
      : t('on {day} at {time}', { day, time })
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
  const time = formatClock(at)
  if (order === 'clock-first')
    return day === 'Today'
      ? t('{time} today', { time })
      : day === 'Tomorrow'
        ? t('{time} tomorrow', { time })
        : t('{time} on {day}', { time, day })
  return day === 'Today'
    ? t('today at {time}', { time })
    : day === 'Tomorrow'
      ? t('tomorrow at {time}', { time })
      : t('{day} at {time}', { day, time })
}

export function bookingHeadline(
  booking: HeadlineBooking,
  now: number
): BookingHeadline {
  const car = booking.vehicle?.model ?? t('car')
  switch (booking.status) {
    case 'pending': {
      if (booking.timeProposal?.status === 'open') {
        return {
          title: t("{name} can't do your time", { name: booking.vendorName }),
          detail: t('Pick one of the times it suggested below.'),
          step: 0,
        }
      }
      if (new Date(booking.scheduledAtIso).getTime() <= now) {
        return {
          title: t("{name} didn't accept in time", { name: booking.vendorName }),
          detail: null,
          step: null,
        }
      }
      if (
        booking.paymentMethod === 'online' &&
        booking.paymentStatus === 'pending'
      ) {
        return {
          title: t('Pay to send your request'),
          detail: t("Requested for {when}. Your time isn't held until you pay.", {
            when: dayWords(booking.scheduledAtIso, now),
          }),
          step: 0,
        }
      }
      const respondBy = booking.responseDeadline?.respondBy
      const requested = t('Requested for {when}.', {
        when: dayWords(booking.scheduledAtIso, now),
      })
      return {
        title: t('Waiting for {name} to accept', { name: booking.vendorName }),
        detail:
          respondBy && Date.parse(respondBy) > now
            ? `${t('They answer by {when}.', { when: dayWords(respondBy, now, 'clock-first') })} ${requested}`
            : requested,
        step: 0,
      }
    }
    case 'confirmed': {
      const when = whenWords(booking.scheduledAtIso, now)
      const title =
        booking.bookingType === 'doorstep'
          ? t('Coming to you {when}', { when })
          : booking.bookingType === 'pickup'
            ? t('Pickup {when}', { when })
            : t('See you {when}', { when })
      return {
        title,
        detail: t('{name} accepted your booking.', { name: booking.vendorName }),
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
        title: washing ? t('Washing your car now') : t('Working on your car now'),
        detail: started
          ? doneBy
            ? t('Started {time} · done by about {doneBy}', {
                time: formatClock(started),
                doneBy: formatClock(doneBy),
              })
            : t('Started {time}', { time: formatClock(started) })
          : null,
        step: 2,
      }
    }
    case 'completed':
      return {
        title: t('Your {car} is done', { car }),
        detail: booking.completedAtIso
          ? `${booking.vendorName} · ${t(formatDay(booking.completedAtIso, now))}`
          : booking.vendorName,
        step: 3,
      }
    case 'rescheduled':
      return { title: t('Moved to a new time'), detail: null, step: null }
    default:
      return { title: t('Booking cancelled'), detail: null, step: null }
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
      return { label: t('Waiting for garage'), tone: 'closed' }
    case 'confirmed':
      return { label: t('Accepted'), tone: 'progress' }
    case 'in_progress':
      return { label: t('In progress'), tone: 'progress' }
    case 'completed':
      return { label: t('Done'), tone: 'done' }
    case 'rescheduled':
      return { label: t('Moved'), tone: 'closed' }
    default:
      return { label: t('Cancelled'), tone: 'closed' }
  }
}

/** "Garage answers by 6:00 pm today", from the booking's response deadline. */
export function answersByLine(respondBy: string, now: number): string {
  return t('Garage answers by {when}', {
    when: dayWords(respondBy, now, 'clock-first'),
  })
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
        out.set(
          card.bookingId,
          t('Approve extra work · {amount}', { amount: money(card.amount) })
        )
        break
      case 'bill_due':
        out.set(
          card.bookingId,
          t('Pay your final bill · {amount}', { amount: money(card.amountDue) })
        )
        break
      case 'time_proposal':
        out.set(card.bookingId, t('Pick another time'))
        break
      case 'garage_closed':
        out.set(card.bookingId, t('Garage closed that day'))
        break
    }
  }
  return out
}
