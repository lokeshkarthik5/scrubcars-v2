/**
 * Coating and detailing follow-ups for a customer's car (0046): when they
 * fall due, what answers them, and when one is shown or sent. Pure and
 * clock-free (the caller passes `now` or today's IST date key), so every
 * rule is unit-tested; modules/car-history stores them and the cron sends.
 *
 * Owner decision (idea #13, 18 Oct 2026):
 *
 * - **A coating** finished on a car schedules two reminders for that car: a
 *   maintenance wash 3 months later and a coating check 12 months later.
 * - **A detailing** schedules a suggested repeat 6 months later. A booking
 *   with both a coating and a detailing schedules only the coating's two:
 *   the coating job includes the detailing, and three reminders for one
 *   visit would be noise.
 * - Due dates count from the job's IST completion date (its slot for a job
 *   from before completion times were recorded, as the wash bar does), in
 *   calendar months: 30 Nov + 3 months is 28 Feb (or 29 in a leap year).
 * - **A newer job moves them**: when a later coating (or detailing)
 *   finishes on the same car, the older job's open reminders of the same
 *   kinds are closed as superseded and the new job's dates stand.
 * - **Booking the service answers it**: a booking for the same car with a
 *   service of a category that answers the reminder (FULFILLED_BY), dated no
 *   earlier than EARLY_FULFIL_DAYS before the due date, counts. While such a
 *   booking is paid and still to happen the reminder reads "booked" and
 *   nothing is shown or sent; once it completes the reminder is done. A
 *   cancelled booking answers nothing, so the reminder comes back.
 * - The customer can **dismiss** one (gone for good) or **snooze** it for
 *   SNOOZE_DAYS from today; a snoozed reminder falls due again then.
 * - **Shown**: the car's history page always shows the nearest open one;
 *   Home shows it as a soft card from HOME_LEAD_DAYS before it is due (only
 *   where Home's card rules leave room, lib/home-cards.ts); Updates has a
 *   row from the due date's morning.
 * - **Sent**: one browser notification in the SERVICE_REMINDER_HOUR (09:00
 *   IST) cron runs of the due date, to customers with Reminders on, claimed
 *   by `notified_on` so overlapping runs never send twice; a snooze makes a
 *   new due date and so one more notification on it.
 */
import { addDays, daysBetween, istDateKey, istMidnight, istParts } from './ist.js'
import type { ServiceCategory } from './categories.js'

export const SERVICE_REMINDER_KINDS = ['maintenance_wash', 'coating_check', 'detailing_repeat'] as const
export type ServiceReminderKind = (typeof SERVICE_REMINDER_KINDS)[number]

/**
 * A reminder's life: open until the customer dismisses it, a booking answers
 * it (done), or a newer job of the same kind replaces it (superseded).
 */
export const SERVICE_REMINDER_STATUSES = ['open', 'dismissed', 'done', 'superseded'] as const
export type ServiceReminderStatus = (typeof SERVICE_REMINDER_STATUSES)[number]

/** What each finished category schedules, in calendar months from the job. */
export const REMINDER_RULES = {
  coating: [
    { kind: 'maintenance_wash', months: 3 },
    { kind: 'coating_check', months: 12 },
  ],
  detailing: [{ kind: 'detailing_repeat', months: 6 }],
} as const satisfies Partial<Record<ServiceCategory, ReadonlyArray<{ kind: ServiceReminderKind; months: number }>>>

/**
 * The categories that answer each reminder when booked for the car. A coating
 * job includes a wash and a detailing, so it answers all three.
 */
export const FULFILLED_BY: Record<ServiceReminderKind, readonly ServiceCategory[]> = {
  maintenance_wash: ['car_wash', 'detailing', 'coating'],
  coating_check: ['coating'],
  detailing_repeat: ['detailing', 'coating'],
}

/**
 * What "Book" on a reminder searches for (the search page's `category`).
 * One of the categories that answer it.
 */
export const REMINDER_BOOK_CATEGORY: Record<ServiceReminderKind, ServiceCategory> = {
  maintenance_wash: 'car_wash',
  coating_check: 'coating',
  detailing_repeat: 'detailing',
}

/**
 * A booking dated this many days before the due date, or later, answers it.
 * Earlier ones are ordinary washes between, not the follow-up: a customer
 * who washes weekly must still hear about the 3-month maintenance wash.
 */
export const EARLY_FULFIL_DAYS = 30
/** Snooze: falls due again this many days from today. */
export const SNOOZE_DAYS = 14
/** Home's soft card shows from this many days before the due date. */
export const HOME_LEAD_DAYS = 7
/** ...and stops this long after it (the car's page still shows it). */
export const HOME_STALE_DAYS = 60
/** The IST hour whose cron runs send the due date's notification. */
export const SERVICE_REMINDER_HOUR = 9
/** At most this many notifications a run; the next run takes the rest. */
export const SERVICE_REMINDER_BATCH = 50

/** The reminder's name, as the car's page, Home and Updates say it. */
export const REMINDER_TITLES: Record<ServiceReminderKind, string> = {
  maintenance_wash: 'Maintenance wash for your coating',
  coating_check: 'Coating check-up',
  detailing_repeat: 'Time for another detailing',
}

const RULE_WORDS: Record<ServiceReminderKind, { months: number; job: string }> = {
  maintenance_wash: { months: 3, job: 'coating' },
  coating_check: { months: 12, job: 'coating' },
  detailing_repeat: { months: 6, job: 'detailing' },
}

/** "3 months since your coating at Shine Studio". */
export function reminderReason(kind: ServiceReminderKind, vendorName: string | null): string {
  const { months, job } = RULE_WORDS[kind]
  const since = `${months} months since your ${job}`
  return vendorName ? `${since} at ${vendorName}` : since
}

/** The car's history page in the customer app, where a reminder is booked, snoozed or dismissed. */
export function carPagePath(vehicleId: string): string {
  return `/profile/cars/${vehicleId}`
}

// ─── Dates ───────────────────────────────────────────────────────────────────

/**
 * A date key plus calendar months, clamped to the month's last day: 31 Aug +
 * 3 months is 30 Nov, 30 Nov + 3 is 28 Feb (29 in a leap year).
 */
export function addMonths(dateKey: string, months: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const index = year * 12 + (month - 1) + months
  const targetYear = Math.floor(index / 12)
  const targetMonth = index % 12
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const d = Math.min(day, lastDay)
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** A job's IST date: when it was completed, or its slot for an old job. */
export function jobDateKey(job: { completedAt: Date | null; scheduledAt: Date }): string {
  return istDateKey(job.completedAt ?? job.scheduledAt)
}

/** The later of two date keys. */
function later(a: string, b: string | null): string {
  return b !== null && b > a ? b : a
}

/** When an open reminder is due now: its date, or the end of its snooze. */
export function effectiveDueOn(reminder: { dueOn: string; snoozedUntil: string | null }): string {
  return later(reminder.dueOn, reminder.snoozedUntil)
}

/** Snoozing today: due again SNOOZE_DAYS from today. */
export function snoozeUntil(today: string): string {
  return addDays(today, SNOOZE_DAYS)
}

/** When the due date's row in Updates is dated: 09:00 IST that day, with the notification. */
export function reminderMomentFor(dueOn: string): Date {
  return new Date(istMidnight(dueOn).getTime() + SERVICE_REMINDER_HOUR * 60 * 60 * 1000)
}

// ─── Scheduling ──────────────────────────────────────────────────────────────

/** A finished job as scheduling reads it. */
export interface FinishedJob {
  id: string
  completedAt: Date | null
  scheduledAt: Date
  /** Every category it booked; a package stands for its members' (and itself). */
  categories: readonly string[]
}

/** The reminders a finished job schedules for its car, by the rules above. */
export function remindersForJob(job: FinishedJob): Array<{ kind: ServiceReminderKind; dueOn: string }> {
  const on = jobDateKey(job)
  const categories = new Set(job.categories)
  const rules = categories.has('coating')
    ? REMINDER_RULES.coating
    : categories.has('detailing')
      ? REMINDER_RULES.detailing
      : []
  return rules.map((rule) => ({ kind: rule.kind, dueOn: addMonths(on, rule.months) }))
}

/** What the rules read from a stored reminder. */
export interface ReminderFacts {
  id: string
  kind: ServiceReminderKind
  dueOn: string
  sourceBookingId: string
}

/**
 * Whether a booking for the car answers this reminder: a category that
 * answers its kind, dated no earlier than EARLY_FULFIL_DAYS before it is
 * due. Never the job that scheduled it.
 */
export function answers(
  reminder: Pick<ReminderFacts, 'kind' | 'dueOn' | 'sourceBookingId'>,
  booking: { id: string; dateKey: string; categories: readonly string[] }
): boolean {
  if (booking.id === reminder.sourceBookingId) return false
  if (!booking.categories.some((category) => FULFILLED_BY[reminder.kind].includes(category as ServiceCategory))) {
    return false
  }
  return booking.dateKey >= addDays(reminder.dueOn, -EARLY_FULFIL_DAYS)
}

/**
 * What a job finishing on a car does to its reminders: the new ones to add,
 * the open ones it answers (done), and the open ones of the same kinds it
 * replaces (superseded). `open` is the car's open reminders.
 */
export function planOnCompletion(
  job: FinishedJob,
  open: ReminderFacts[]
): {
  insert: Array<{ kind: ServiceReminderKind; dueOn: string }>
  done: string[]
  superseded: string[]
} {
  const insert = remindersForJob(job)
  const newKinds = new Set(insert.map((reminder) => reminder.kind))
  const booking = { id: job.id, dateKey: jobDateKey(job), categories: job.categories }
  const done: string[] = []
  const superseded: string[] = []
  for (const reminder of open) {
    if (reminder.sourceBookingId === job.id) continue
    if (answers(reminder, booking)) done.push(reminder.id)
    else if (newKinds.has(reminder.kind)) superseded.push(reminder.id)
  }
  return { insert, done, superseded }
}

// ─── Where an open reminder stands ───────────────────────────────────────────

/** A booking of the car, as the standing reads it. */
export interface CarBooking {
  id: string
  status: string
  scheduledAt: Date
  completedAt: Date | null
  /** Payment paid or collected: a pay-later booking holds nothing until then. */
  paid: boolean
  categories: readonly string[]
}

export type ReminderState = 'upcoming' | 'due_soon' | 'due' | 'overdue'

export type ReminderStanding =
  | { kind: 'done'; bookingId: string }
  | { kind: 'booked'; bookingId: string; scheduledAt: Date }
  | {
      kind: 'open'
      state: ReminderState
      /** The due date in force (after a snooze). */
      dueOn: string
      /** Days from today (0 = today), negative once overdue. */
      daysLeft: number
    }

const LIVE = new Set(['pending', 'confirmed', 'in_progress'])

/**
 * An open reminder against the car's bookings today: done by a completed
 * booking that answers it, booked by a paid one still to happen, else due
 * by its dates.
 */
export function reminderStanding(
  reminder: ReminderFacts & { snoozedUntil: string | null },
  bookings: CarBooking[],
  today: string
): ReminderStanding {
  const answering = bookings
    .map((b) => ({ b, dateKey: jobDateKey(b) }))
    .filter(({ b, dateKey }) => answers(reminder, { id: b.id, dateKey, categories: b.categories }))
  const completed = answering.find(({ b }) => b.status === 'completed')
  if (completed) return { kind: 'done', bookingId: completed.b.id }
  const booked = answering
    .filter(({ b }) => LIVE.has(b.status) && b.paid)
    .sort((x, y) => x.b.scheduledAt.getTime() - y.b.scheduledAt.getTime())[0]
  if (booked) return { kind: 'booked', bookingId: booked.b.id, scheduledAt: booked.b.scheduledAt }

  const dueOn = effectiveDueOn(reminder)
  const daysLeft = daysBetween(today, dueOn)
  const state: ReminderState =
    daysLeft < 0 ? 'overdue' : daysLeft === 0 ? 'due' : daysLeft <= HOME_LEAD_DAYS ? 'due_soon' : 'upcoming'
  return { kind: 'open', state, dueOn, daysLeft }
}

/** Whether Home may show it as its soft card: due within a week, not long overdue. */
export function showsOnHome(standing: ReminderStanding): boolean {
  return standing.kind === 'open' && standing.state !== 'upcoming' && standing.daysLeft >= -HOME_STALE_DAYS
}

/** Whether Updates has its row yet: from the due date's 09:00 IST. */
export function inUpdates(standing: ReminderStanding, now: Date): boolean {
  return standing.kind === 'open' && reminderMomentFor(standing.dueOn).getTime() <= now.getTime()
}

/** Whether a cron run at `now` is one of the due-date notification runs (09:00–09:59 IST). */
export function isReminderPushRun(now: Date): boolean {
  return istParts(now).hour === SERVICE_REMINDER_HOUR
}

/**
 * Whether to send this reminder's notification in the run at `now`: a
 * 09:00 IST run on its due date (after any snooze), still open and not
 * answered, and not already sent for that date.
 */
export function reminderPushDue(
  reminder: { notifiedOn: string | null },
  standing: ReminderStanding,
  now: Date
): boolean {
  if (!isReminderPushRun(now) || standing.kind !== 'open') return false
  const today = istDateKey(now)
  return standing.dueOn === today && reminder.notifiedOn !== today
}

/** The nearest of several by due date in force (ties: the older reminder first). */
export function nearestFirst<T extends { standing: ReminderStanding; createdAt: Date }>(a: T, b: T): number {
  const dueOf = (x: T) => (x.standing.kind === 'open' ? x.standing.dueOn : '9999-12-31')
  return dueOf(a).localeCompare(dueOf(b)) || a.createdAt.getTime() - b.createdAt.getTime()
}

/** An open reminder as Home and Updates read it (modules/car-history serviceRemindersFor). */
export interface HubServiceReminder {
  id: string
  vehicleId: string
  /** "Honda City": in the app only, never in a notification. */
  vehicleName: string
  kind: ServiceReminderKind
  /** The garage that did the job that scheduled it. */
  vendorName: string
  standing: ReminderStanding
  createdAt: Date
}

/** Its Updates row's id: a snooze makes a new due date, and so a new (unread) row. */
export function serviceReminderRowId(reminder: { id: string }, dueOn: string): string {
  return `service_reminder:${reminder.id}:${dueOn}`
}
