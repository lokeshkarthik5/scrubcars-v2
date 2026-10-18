import { runInBackground } from '../../lib/background.js'
import { buildCarHistory, type CarHistory } from '../../lib/car-history.js'
import type { ServiceCategory } from '../../lib/categories.js'
import { isPushEnabled } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import { addDays, istDateKey, istMidnight } from '../../lib/ist.js'
import { logger } from '../../lib/logger.js'
import { customerServiceReminder } from '../../lib/push-messages.js'
import {
  EARLY_FULFIL_DAYS,
  effectiveDueOn,
  isReminderPushRun,
  nearestFirst,
  planOnCompletion,
  REMINDER_BOOK_CATEGORY,
  REMINDER_TITLES,
  reminderPushDue,
  reminderReason,
  reminderStanding,
  SERVICE_REMINDER_BATCH,
  snoozeUntil,
  type CarBooking,
  type HubServiceReminder,
  type ReminderStanding,
  type ServiceReminderKind,
} from '../../lib/service-reminders.js'
import { pushService } from '../push/push.service.js'
import { carHistoryRepository, type OpenReminderRow } from './car-history.repository.js'
import type { CarHistoryQuery } from './car-history.validation.js'

const log = logger.child({ module: 'car-history' })

/** The cron's catch-up looks back this far for completions never scheduled. */
const CATCH_UP_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000
/** ...and schedules at most this many a run. */
const CATCH_UP_BATCH = 20
/** One cron run spends at most this long on reminders. */
const SWEEP_BUDGET_MS = 10_000

/** A reminder as the car's page shows it. */
export interface ServiceReminderView {
  id: string
  vehicleId: string
  kind: ServiceReminderKind
  /** "Maintenance wash for your coating". */
  title: string
  /** "3 months since your coating at Shine Studio". */
  reason: string
  /** The due date in force, "YYYY-MM-DD" (after a snooze). */
  dueOn: string
  /** The date the rules gave it, before any snooze. */
  originalDueOn: string
  snoozed: boolean
  state: 'upcoming' | 'due_soon' | 'due' | 'overdue' | 'booked'
  /** Days until due (0 = today), negative once overdue; null once booked. */
  daysLeft: number | null
  /** The paid booking that answers it, still to happen. */
  booked: { bookingId: string; scheduledAt: string } | null
  /** What "Book" searches for (the search page's category). */
  bookCategory: ServiceCategory
}

export interface CarHistoryResponse extends CarHistory {
  car: {
    id: string
    make: string
    model: string
    color: string | null
    licensePlate: string | null
    vehicleType: string
    isDefault: boolean
  }
  /** The nearest open follow-up for this car (else the nearest booked one), or null. */
  reminder: ServiceReminderView | null
}

function notFound(): AppError {
  return new AppError(404, 'Vehicle not found', 'VEHICLE_NOT_FOUND')
}

function reminderNotFound(): AppError {
  return new AppError(404, 'Reminder not found', 'REMINDER_NOT_FOUND')
}

/** The earliest moment a booking can answer any of these reminders. */
function answeringSince(reminders: Array<{ dueOn: string }>): Date {
  const earliest = reminders.map((r) => r.dueOn).sort()[0]
  return istMidnight(addDays(earliest, -EARLY_FULFIL_DAYS))
}

function standingOf(reminder: OpenReminderRow, bookings: CarBooking[], today: string): ReminderStanding {
  return reminderStanding(reminder, bookings, today)
}

function toView(reminder: OpenReminderRow, standing: Exclude<ReminderStanding, { kind: 'done' }>): ServiceReminderView {
  const base = {
    id: reminder.id,
    vehicleId: reminder.vehicleId,
    kind: reminder.kind,
    title: REMINDER_TITLES[reminder.kind],
    reason: reminderReason(reminder.kind, reminder.vendorName),
    originalDueOn: reminder.dueOn,
    snoozed: reminder.snoozedUntil !== null && reminder.snoozedUntil > reminder.dueOn,
    bookCategory: REMINDER_BOOK_CATEGORY[reminder.kind],
  }
  if (standing.kind === 'booked') {
    return {
      ...base,
      dueOn: effectiveDueOn(reminder),
      state: 'booked',
      daysLeft: null,
      booked: { bookingId: standing.bookingId, scheduledAt: standing.scheduledAt.toISOString() },
    }
  }
  return { ...base, dueOn: standing.dueOn, state: standing.state, daysLeft: standing.daysLeft, booked: null }
}

/**
 * Where each open reminder stands against its car's bookings. Reads the
 * bookings only when there are reminders.
 */
async function withStandings(
  reminders: OpenReminderRow[],
  today: string,
  userId?: string
): Promise<Array<{ reminder: OpenReminderRow; standing: ReminderStanding }>> {
  if (reminders.length === 0) return []
  const vehicleIds = [...new Set(reminders.map((r) => r.vehicleId))]
  const bookings = await carHistoryRepository.listCarBookings(vehicleIds, answeringSince(reminders), userId)
  return reminders.map((reminder) => ({
    reminder,
    standing: standingOf(
      reminder,
      bookings.filter((b) => b.vehicleId === reminder.vehicleId),
      today
    ),
  }))
}

export const carHistoryService = {
  /**
   * One of the customer's cars with its history (lib/car-history.ts) and its
   * nearest service reminder. Anyone else's car, or one they removed, is a 404.
   */
  async getHistory(userId: string, vehicleId: string, query: CarHistoryQuery, now = new Date()): Promise<CarHistoryResponse> {
    const car = await carHistoryRepository.findOwnCar(userId, vehicleId)
    if (!car) throw notFound()

    const rows = await carHistoryRepository.listCarRows(userId, vehicleId)
    const history = buildCarHistory(rows, { now, category: query.category ?? null })

    const reminders = await carHistoryRepository.listOpenReminders(userId, vehicleId)
    const bookings: CarBooking[] = rows.map((row) => ({
      id: row.id,
      status: row.status,
      scheduledAt: row.scheduledAt,
      completedAt: row.completedAt,
      paid: row.payment?.status === 'paid' || row.payment?.status === 'collected',
      categories: row.categories,
    }))
    const today = istDateKey(now)
    const standings = reminders
      .map((reminder) => ({ reminder, createdAt: reminder.createdAt, standing: standingOf(reminder, bookings, today) }))
      .filter((each) => each.standing.kind !== 'done')
    const nearest =
      standings.filter((each) => each.standing.kind === 'open').sort(nearestFirst)[0] ??
      standings.filter((each) => each.standing.kind === 'booked')[0]

    return {
      car,
      ...history,
      reminder:
        nearest && nearest.standing.kind !== 'done' ? toView(nearest.reminder, nearest.standing) : null,
    }
  },

  /** × on a reminder: closed for good. Saying it twice is not an error. */
  async dismissReminder(userId: string, reminderId: string, now = new Date()) {
    const own = await carHistoryRepository.findOwnReminder(userId, reminderId)
    if (!own) throw reminderNotFound()
    if (own.status === 'open') {
      await carHistoryRepository.dismiss(userId, reminderId, now)
      log.info({ userId, reminderId }, 'service_reminder:dismissed')
    }
    return { dismissed: true }
  },

  /**
   * "Remind me in 2 weeks": due again SNOOZE_DAYS from today (IST). Only
   * while it is open: 409 once dismissed, answered or replaced.
   */
  async snoozeReminder(userId: string, reminderId: string, now = new Date()) {
    const own = await carHistoryRepository.findOwnReminder(userId, reminderId)
    if (!own) throw reminderNotFound()
    const until = snoozeUntil(istDateKey(now))
    if (own.status !== 'open' || !(await carHistoryRepository.snooze(userId, reminderId, until))) {
      throw new AppError(409, 'This reminder is no longer open.', 'REMINDER_CLOSED')
    }
    log.info({ userId, reminderId, until }, 'service_reminder:snoozed')
    return { snoozedUntil: until }
  },

  /**
   * The customer's open reminders on their current cars with where each
   * stands, for Home's soft card and Updates' rows. One read, and the
   * bookings only when there is a reminder.
   */
  async remindersForHub(userId: string, now = new Date()): Promise<HubServiceReminder[]> {
    const reminders = await carHistoryRepository.listOpenReminders(userId)
    const standings = await withStandings(reminders, istDateKey(now), userId)
    return standings
      .filter(({ standing }) => standing.kind === 'open')
      .map(({ reminder, standing }) => ({
        id: reminder.id,
        vehicleId: reminder.vehicleId,
        vehicleName: reminder.vehicleName,
        kind: reminder.kind,
        vendorName: reminder.vendorName,
        standing,
        createdAt: reminder.createdAt,
      }))
  },

  /**
   * A job just completed: schedules its follow-ups, and closes the car's
   * open reminders it answers or replaces (lib/service-reminders.ts
   * planOnCompletion). Safe to run twice: a job's reminders are written once
   * (unique), and only open ones are closed.
   */
  async onBookingCompleted(bookingId: string, now = new Date()) {
    const job = await carHistoryRepository.findFinishedJob(bookingId)
    if (!job || job.status !== 'completed') return null
    const open = await carHistoryRepository.listOpenRemindersOfCar(job.vehicleId)
    const plan = planOnCompletion(job, open)
    if (plan.insert.length === 0 && plan.done.length === 0 && plan.superseded.length === 0) return null
    const result = await carHistoryRepository.applyCompletion({ job, ...plan, at: now })
    if (result.inserted + result.done + result.superseded > 0) {
      log.info({ bookingId, vehicleId: job.vehicleId, ...result }, 'service_reminder:scheduled')
    }
    return result
  },

  /**
   * After a completion's response: never slows or fails Mark completed or
   * Delivered. The cron's catch-up writes any that did not run.
   */
  scheduleAfterCompletion(bookingId: string): void {
    runInBackground('service_reminders_schedule', () => carHistoryService.onBookingCompleted(bookingId))
  },

  /**
   * The pending-digest cron's part (every 10 minutes): first a catch-up for
   * coating and detailing jobs completed in the last two days with no
   * reminders yet; then, in the 09:00 IST runs only, the due date's
   * browser notification for each open reminder due today, claimed first
   * (`notified_on`) so it goes once, to customers with Reminders on. A dry
   * run only counts. Notifications off, nothing about them is read.
   */
  async sweep(options: { dryRun: boolean }, now = new Date()) {
    const started = Date.now()
    const summary = { scheduled: 0, sent: 0, skipped: 0, failed: 0 }

    if (!options.dryRun) {
      const missed = await carHistoryRepository.listUnscheduledCompletions(
        new Date(now.getTime() - CATCH_UP_LOOKBACK_MS),
        CATCH_UP_BATCH
      )
      for (const bookingId of missed) {
        if (Date.now() - started > SWEEP_BUDGET_MS) return { ...summary, outOfTime: true }
        try {
          if (await carHistoryService.onBookingCompleted(bookingId, now)) summary.scheduled += 1
        } catch (err) {
          summary.failed += 1
          log.error({ err, bookingId }, 'service_reminder:catch_up_failed')
        }
      }
    }

    if (!isPushEnabled() || !isReminderPushRun(now)) return summary

    const today = istDateKey(now)
    const candidates = await carHistoryRepository.listPushCandidates(today, SERVICE_REMINDER_BATCH)
    for (const { reminder, standing } of await withStandings(candidates, today)) {
      if (Date.now() - started > SWEEP_BUDGET_MS) return { ...summary, outOfTime: true }
      if (!reminderPushDue(reminder, standing, now)) {
        summary.skipped += 1
        continue
      }
      if (options.dryRun) {
        summary.sent += 1
        continue
      }
      try {
        if (!(await carHistoryRepository.claimNotified(reminder.id, today))) {
          summary.skipped += 1
          continue
        }
        await pushService.sendNow({ audience: 'customer', userId: reminder.userId }, customerServiceReminder(reminder))
        summary.sent += 1
      } catch (err) {
        summary.failed += 1
        log.error({ err, reminderId: reminder.id }, 'service_reminder:push_failed')
      }
    }
    if (summary.sent + summary.failed > 0) log.info(summary, 'service_reminder:pushed')
    return summary
  },
}
