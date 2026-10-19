import { bookingReference, istDateRange } from '../../lib/booking-ops.js'
import { env } from '../../lib/env.js'
import { logger } from '../../lib/logger.js'
import { adminService } from '../admin/admin.service.js'
import { bypassReportsService } from '../bypass-reports/bypass-reports.service.js'
import { complaintsService } from '../complaints/complaints.service.js'
import { guaranteeService } from '../guarantee/guarantee.service.js'
import { payoutsService } from '../payouts/payouts.service.js'
import { refundsService } from '../refunds/refunds.service.js'
import { statsService } from '../stats/stats.service.js'
import { todayRepository } from './today.repository.js'
import {
  bookingsToday,
  excerpt,
  garageFigures,
  garageTasks,
  istDate,
  sortTasks,
  taskCounts,
  TASK_GROUP,
  type GarageRow,
  type TodayTask,
} from './today.rules.js'

const log = logger.child({ module: 'today' })

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Where the inbox reads from: each list page's own service, so a task is on
 * Today exactly when its page would show it as open. On an object so the
 * route test can stand each one in without a database.
 */
export const todaySources = {
  waitingBookings: (now: Date) =>
    todayRepository.listWaitingBookings(new Date(now.getTime() - DAY_MS)),
  day: (start: Date, end: Date) => todayRepository.listDay(start, end),
  complaints: (now: Date) => complaintsService.list({ show: 'open' }, now),
  // Redo claims only while the Guarantee is on; its route is a 404 otherwise.
  claims: (now: Date) =>
    env.guaranteeEnabled
      ? guaranteeService.adminList({ tab: 'needs_decision' }, now)
      : null,
  bypassReports: (now: Date) => bypassReportsService.list({ show: 'new' }, now),
  refundsOwed: () => refundsService.listRefunds({ status: 'owed' }),
  payoutsDue: (now: Date) => payoutsService.dueSummary(now),
  garages: () => adminService.listVendors() as Promise<GarageRow[]>,
  collected: (day: string) =>
    statsService.overview({ from: day, to: day, compare: false }),
}

/** A read that may fail on its own without taking the whole inbox down. */
async function optional<T>(
  what: string,
  read: () => Promise<T> | T
): Promise<T | null> {
  try {
    return await read()
  } catch (err) {
    log.warn({ err, what }, 'today:source_failed')
    return null
  }
}

const iso = (at: Date | string | null | undefined) =>
  at == null ? null : new Date(at).toISOString()

export const todayService = {
  /**
   * Every open task with its deadline, the menu's counts, four headline
   * numbers, the day's schedule and the garages' figures. Read one source
   * after the other: the API has a single database connection.
   */
  async summary(now = new Date()) {
    const tasks: TodayTask[] = []
    const day = istDate(now)
    const { start, end } = istDateRange(day, day)

    for (const b of await todaySources.waitingBookings(now)) {
      const respondBy = iso(b.respondBy)
      tasks.push({
        key: `booking_waiting:${b.id}`,
        kind: 'booking_waiting',
        group: TASK_GROUP.booking_waiting,
        // No deadline (a booking from before 0042): the slot is the clock.
        dueAt: respondBy ?? iso(b.scheduledAt),
        since: null,
        late: respondBy !== null && Date.parse(respondBy) <= now.getTime(),
        bookingId: b.id,
        reference: bookingReference(b.id),
        garage: { name: b.garageName, phone: b.garagePhone },
        customerName: b.customerName ?? null,
        services: b.services,
        amount: String(b.amount),
        scheduledAt: new Date(b.scheduledAt).toISOString(),
      })
    }

    const complaints = await todaySources.complaints(now)
    for (const c of complaints.complaints) {
      const stage = c.status === 'open' ? 'acknowledge' : 'resolve'
      tasks.push({
        key: `complaint:${c.id}`,
        kind: 'complaint',
        group: TASK_GROUP.complaint,
        dueAt: stage === 'acknowledge' ? c.acknowledgeBy : c.resolveBy,
        since: null,
        late: c.overdue !== null,
        complaintId: c.id,
        number: c.number,
        message: excerpt(c.message),
        customerName: c.customer.name,
        garageName: c.garage?.name ?? null,
        stage,
      })
    }

    const claims = await todaySources.claims(now)
    for (const claim of claims?.items ?? []) {
      tasks.push({
        key: `redo_claim:${claim.id}`,
        kind: 'redo_claim',
        group: TASK_GROUP.redo_claim,
        dueAt: claim.detlioDecideBy,
        since: claim.detlioDecideBy ? null : claim.createdAt,
        late: claim.overdue,
        claimId: claim.id,
        bookingRef: claim.bookingRef,
        customerName: claim.customer.name,
        garageName: claim.garageName,
        issues:
          claim.issues.map((issue) => issue.label).join(', ') ||
          (claim.otherText ?? ''),
      })
    }

    const reports = await todaySources.bypassReports(now)
    for (const report of reports.reports) {
      tasks.push({
        key: `bypass_report:${report.id}`,
        kind: 'bypass_report',
        group: TASK_GROUP.bypass_report,
        dueAt: null,
        since: report.createdAt,
        late: false,
        reportId: report.id,
        kindLabel: report.kindLabel,
        customerName: report.customer?.name ?? null,
        garageName: report.garage.name,
        strikes: report.garage.strikes,
      })
    }

    for (const refund of await todaySources.refundsOwed()) {
      tasks.push({
        key: `refund_owed:${refund.id}`,
        kind: 'refund_owed',
        group: TASK_GROUP.refund_owed,
        dueAt: null,
        since: refund.since,
        late: false,
        refundId: refund.id,
        bookingId: refund.bookingId,
        reference: refund.reference,
        customerName: refund.customer.name,
        garageName: refund.garageName,
        amountOwed: refund.amountOwed,
        razorpayPaymentId: refund.razorpayPaymentId,
      })
    }

    const payouts = await todaySources.payoutsDue(now)
    if (payouts && payouts.garages > 0) {
      tasks.push({
        key: 'payouts_due:all',
        kind: 'payouts_due',
        group: TASK_GROUP.payouts_due,
        dueAt: null,
        since: iso(payouts.oldestUnpaidAt),
        late: payouts.overdue,
        garages: payouts.garages,
        total: String(payouts.total),
      })
    }

    const vendors = await todaySources.garages()
    tasks.push(...garageTasks(vendors))
    const garages = garageFigures(vendors)

    const schedule = start && end ? await todaySources.day(start, end) : []
    // As Statistics counts it, so the two pages never disagree. Optional: a
    // slow statistics read leaves the tile empty, not the inbox.
    const overview = await optional('collected', () =>
      todaySources.collected(day)
    )

    const sorted = sortTasks(tasks)
    const counts = taskCounts(sorted)
    return {
      now: now.toISOString(),
      day,
      tasks: sorted,
      counts,
      headline: {
        bookingsToday: bookingsToday(schedule),
        collectedToday: overview ? overview.kpis.collected : null,
        garages: { live: garages.live, total: garages.total },
        openIssues: {
          total: counts.issues.n,
          complaintsLate: sorted.filter(
            (task) => task.kind === 'complaint' && task.late
          ).length,
        },
      },
      schedule: schedule
        .filter((row) => row.status !== 'cancelled')
        .map((row) => ({
          id: row.id,
          reference: bookingReference(row.id),
          scheduledAt: new Date(row.scheduledAt).toISOString(),
          status: row.status,
          bookingType: row.bookingType,
          customerName: row.customerName ?? null,
          garageName: row.garageName,
          services: row.services,
        })),
      garages: {
        live: garages.live,
        blocked: garages.blocked,
        paused: garages.paused,
        documentsToReview: garages.documentsToReview,
      },
    }
  },
}

export type TodaySummary = Awaited<ReturnType<typeof todayService.summary>>
