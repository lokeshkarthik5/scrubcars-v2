/**
 * "Notify me if a slot opens" (0047): the pure rules. A customer who finds a
 * day full at a garage (or no time left in the part of the day they want)
 * leaves an alert for that garage and IST date; when capacity is freed
 * there, the alert is re-checked with the slot list's own rule
 * (lib/slots.ts slotsForDay) for its job length and booking type, and if a
 * time in its window is now free the customer hears it once: a push (when
 * they have notifications on) and an Updates row. First come, first served:
 * the time is not held for them.
 *
 * No env, no database, so every rule is unit-tested. modules/slot-alerts
 * stores, re-checks and sends. The apps' words and numbers are
 * packages/core/src/slot-alerts.ts (slot-alerts.parity.test.ts).
 */
import type { BookingType } from './booking-types.js'
import { istDayLabel, istParts, istTimeLabel } from './ist.js'
import { isPickupOffered, type PickupSettings } from './pickup.js'
import {
  addDaysToDateKey,
  getDateKeyFromScheduledAt,
  istDayBounds,
  slotsForDay,
  todayDateKey,
  type DayFacts,
  type DayStatus,
} from './slots.js'

export const SLOT_ALERT_WINDOWS = ['any', 'morning', 'afternoon', 'evening'] as const
/** The part of the day the customer wants: a start time in it counts. */
export type SlotAlertWindow = (typeof SLOT_ALERT_WINDOWS)[number]

/**
 * Each window's IST hours, start included, end not: a 12:00 start is
 * afternoon. "Any time" has none: every time the garage offers counts.
 */
export const SLOT_ALERT_WINDOW_HOURS: Record<Exclude<SlotAlertWindow, 'any'>, { from: number; to: number }> = {
  morning: { from: 6, to: 12 },
  afternoon: { from: 12, to: 17 },
  evening: { from: 17, to: 22 },
}

/** At most this many waiting alerts per customer, across garages. */
export const MAX_ACTIVE_SLOT_ALERTS = 5

/** How far ahead an alert may be set, in days from today (IST). */
export const SLOT_ALERT_MAX_DAYS_AHEAD = 60

/** A re-check reads at most this many waiting alerts for one garage and day. */
export const RECHECK_ALERT_LIMIT = 50

/**
 * Notified and expired alerts are kept this long (Updates shows 30 days),
 * then the cron deletes them.
 */
export const SLOT_ALERT_KEEP_DAYS = 31

/** Whether a slot (an ISO start) starts inside the window, in IST. */
export function inWindow(slot: string | Date, window: SlotAlertWindow): boolean {
  if (window === 'any') return true
  const { hour } = istParts(new Date(slot))
  const hours = SLOT_ALERT_WINDOW_HOURS[window]
  return hour >= hours.from && hour < hours.to
}

/** An alert lasts until its day is over in IST. */
export function alertExpiresAt(date: string): Date {
  return istDayBounds(date).end
}

/** Waiting: not yet notified, and its day not over. */
export function isAlertActive(alert: { notifiedAt: Date | null; expiresAt: Date }, now: Date): boolean {
  return alert.notifiedAt === null && alert.expiresAt.getTime() > now.getTime()
}

/** Why an alert cannot be set for this date, or null when it can. */
export function alertDateProblem(date: string, now: Date): 'in_the_past' | 'too_far_ahead' | null {
  const today = todayDateKey(now.getTime())
  if (date < today) return 'in_the_past'
  if (date > addDaysToDateKey(today, SLOT_ALERT_MAX_DAYS_AHEAD)) return 'too_far_ahead'
  return null
}

/**
 * The cap, decided on what was read under the customer's lock. Changing the
 * window of the alert already waiting for that garage and day replaces it,
 * so it never counts against the cap: one alert per garage and date.
 */
export function alertLimitRefusal(facts: { activeCount: number; replacing: boolean }): 'limit' | null {
  if (facts.replacing) return null
  return facts.activeCount >= MAX_ACTIVE_SLOT_ALERTS ? 'limit' : null
}

/** What an alert matches on: the job's length, its booking type, the window. */
export interface AlertJob {
  durationMins: number
  bookingType: BookingType
  window: SlotAlertWindow
}

export interface AlertDay {
  day: DayStatus
  /** The job fits between opening and closing at all. */
  fitsInDay: boolean
  /** Times in the window with enough notice, free or not. */
  noticedInWindow: string[]
  /** Times in the window the picker would offer now, earliest first. */
  free: string[]
}

/**
 * The slot list's own rule (slotsForDay: the day, hours and job length, the
 * notice for this booking type, the bays and the day's cap) for the alert's
 * job, then its window.
 */
export function alertDay(facts: DayFacts, job: AlertJob, now: number): AlertDay {
  const result = slotsForDay(facts, job, now)
  return {
    day: result.day,
    fitsInDay: result.allDay.length > 0,
    noticedInWindow: result.noticed.filter((slot) => inWindow(slot, job.window)),
    free: result.slots.filter((slot) => inWindow(slot, job.window)),
  }
}

/** The earliest free time the alert matches, or null. */
export function firstOpening(facts: DayFacts, job: AlertJob, now: number): string | null {
  return alertDay(facts, job, now).free[0] ?? null
}

export type AskRefusal = 'paused' | 'closed' | 'too_long' | 'no_times' | 'slot_free'

/**
 * Whether an alert makes sense for this day, from the same answer. Only a
 * day that is open, fits the job and still has times in the window with
 * enough notice can open up: a closed day or one whose window has passed
 * cannot, and a time free right now should be booked, not waited for.
 */
export function askRefusal(day: AlertDay): AskRefusal | null {
  if (!day.day.open) return day.day.reason === 'paused' ? 'paused' : 'closed'
  if (!day.fitsInDay) return 'too_long'
  if (day.noticedInWindow.length === 0) return 'no_times'
  if (day.free.length > 0) return 'slot_free'
  return null
}

/** Whether the garage still takes this booking type (the garage page's switches). */
export function takesBookingType(
  garage: { dropinEnabled: boolean; doorstepEnabled: boolean } & PickupSettings,
  type: BookingType
): boolean {
  switch (type) {
    case 'dropin':
      return garage.dropinEnabled
    case 'doorstep':
      return garage.doorstepEnabled
    case 'pickup':
      return isPickupOffered(garage)
  }
}

/**
 * The IST dates a booking held capacity on: its start's, and its end's when
 * it ran past midnight (a capacity holder counts on the day after too).
 */
export function datesHeld(scheduledAt: Date, durationMins: number | null | undefined): string[] {
  const start = getDateKeyFromScheduledAt(scheduledAt)
  const end = getDateKeyFromScheduledAt(new Date(scheduledAt.getTime() + Math.max(0, (durationMins ?? 0) * 60_000 - 1)))
  return start === end ? [start] : [start, end]
}

/**
 * Where the push and the Updates row open: checkout at that garage with the
 * same services, the date picked and the booking type set, so the free time
 * is one tap away. A service withdrawn since sends checkout back to the
 * garage page, which says so. At garage is the default and is not spelled out.
 */
export function slotAlertPath(alert: {
  vendorId: string
  date: string
  bookingType: BookingType
  serviceIds: string[]
}): string {
  const params = new URLSearchParams({ service: alert.serviceIds.join(','), date: alert.date })
  if (alert.bookingType !== 'dropin') params.set('mode', alert.bookingType)
  return `/book/${alert.vendorId}?${params.toString()}`
}

/**
 * "A slot opened at Sparkle Car Spa", "Sat 24 Oct — 10:30 AM. Book before it
 * goes." The push and the Updates row say the same. Garage name and a time
 * only: nothing about the customer.
 */
export function slotOpenedWords(garageName: string, slotAt: Date): { title: string; body: string } {
  return {
    title: `A slot opened at ${garageName}`,
    body: `${istDayLabel(slotAt)} — ${istTimeLabel(slotAt)}. Book before it goes.`,
  }
}
