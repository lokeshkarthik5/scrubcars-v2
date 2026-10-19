/**
 * The admin's "Today" inbox (UX audit, admin mockup 02): every open task with
 * a clock on it, from the same rules the list pages already use, in one list
 * ordered by deadline. Pure — the service gathers the rows, these decide the
 * order, the groups and the counts — so they are unit-tested without a
 * database (today.rules.test.ts).
 */

export type TodayTaskKind =
  | 'booking_waiting'
  | 'complaint'
  | 'redo_claim'
  | 'bypass_report'
  | 'refund_owed'
  | 'payouts_due'
  | 'documents'
  | 'garage_blocked'

/** The inbox's filter tabs: All · Bookings · Issues · Money · Garages. */
export type TodayGroup = 'bookings' | 'issues' | 'money' | 'garages'

export const TASK_GROUP: Record<TodayTaskKind, TodayGroup> = {
  booking_waiting: 'bookings',
  complaint: 'issues',
  redo_claim: 'issues',
  bypass_report: 'issues',
  refund_owed: 'money',
  payouts_due: 'money',
  documents: 'garages',
  garage_blocked: 'garages',
}

interface TaskBase {
  /** Stable across refreshes: `${kind}:${id}`. */
  key: string
  group: TodayGroup
  /** A real deadline (accept by, acknowledge by, decide by), or null. */
  dueAt: string | null
  /** How long it has been waiting, for the ones with no deadline of their own. */
  since: string | null
  /** Past its deadline. */
  late: boolean
}

export type TodayTask = TaskBase &
  (
    | {
        kind: 'booking_waiting'
        bookingId: string
        reference: string
        garage: { name: string; phone: string }
        customerName: string | null
        services: string
        amount: string
        scheduledAt: string
      }
    | {
        kind: 'complaint'
        complaintId: string
        number: string
        message: string
        customerName: string
        garageName: string | null
        /** What is owed next: an acknowledgement in 24 h, then a resolution in 7 days. */
        stage: 'acknowledge' | 'resolve'
      }
    | {
        kind: 'redo_claim'
        claimId: string
        bookingRef: string
        customerName: string
        garageName: string
        issues: string
      }
    | {
        kind: 'bypass_report'
        reportId: string
        kindLabel: string
        customerName: string | null
        garageName: string
        strikes: number
      }
    | {
        kind: 'refund_owed'
        refundId: string
        bookingId: string | null
        reference: string
        customerName: string
        garageName: string
        amountOwed: string
        razorpayPaymentId: string | null
      }
    | { kind: 'payouts_due'; garages: number; total: string }
    | {
        kind: 'documents'
        vendorId: string
        garageName: string
        toReview: number
      }
    | {
        kind: 'garage_blocked'
        vendorId: string
        garageName: string
        blocking: string[]
      }
  )

/** A count for the menu, and whether any of it is late (drawn coral, not amber). */
export interface TodayCount {
  n: number
  late: number
}

export interface TodayCounts {
  today: TodayCount
  bookings: TodayCount
  issues: TodayCount
  refunds: TodayCount
  garages: TodayCount
}

const time = (iso: string | null) => (iso ? Date.parse(iso) : Number.NaN)

/**
 * Ordered by deadline: everything with one first, soonest (so the latest
 * late one) on top; then what is only waiting, oldest first; then the rest
 * (garages to fix), as the list gave them.
 */
export function sortTasks(tasks: TodayTask[]): TodayTask[] {
  const rank = (task: TodayTask) => (task.dueAt ? 0 : task.since ? 1 : 2)
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      const byRank = rank(a.task) - rank(b.task)
      if (byRank !== 0) return byRank
      const at =
        rank(a.task) === 0
          ? time(a.task.dueAt) - time(b.task.dueAt)
          : time(a.task.since) - time(b.task.since)
      return at !== 0 && !Number.isNaN(at) ? at : a.index - b.index
    })
    .map(({ task }) => task)
}

function countOf(tasks: TodayTask[]): TodayCount {
  return { n: tasks.length, late: tasks.filter((task) => task.late).length }
}

/**
 * The menu's counts. Today is every open task; each other place counts its
 * own: Bookings waiting for the garage, Issues to acknowledge or decide,
 * Refunds owed (payouts are counted on Today, not on Refunds), Garages with
 * documents to review or blocked from going live.
 */
export function taskCounts(tasks: TodayTask[]): TodayCounts {
  return {
    today: countOf(tasks),
    bookings: countOf(tasks.filter((task) => task.group === 'bookings')),
    issues: countOf(tasks.filter((task) => task.group === 'issues')),
    refunds: countOf(tasks.filter((task) => task.kind === 'refund_owed')),
    garages: countOf(tasks.filter((task) => task.group === 'garages')),
  }
}

/** "Mon 19 Oct" in Chennai, as YYYY-MM-DD: the day the inbox is about. */
export function istDate(now: Date): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

/** One line of a complaint, for the list: the first 120 characters, on one line. */
export function excerpt(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

export interface ScheduleRow {
  status: string
}

/** "14 · 6 done · 5 to come · 3 waiting for garage": today's bookings, not cancelled. */
export function bookingsToday(rows: ScheduleRow[]): {
  total: number
  done: number
  toCome: number
  waiting: number
} {
  const live = rows.filter((row) => row.status !== 'cancelled')
  const done = live.filter((row) => row.status === 'completed').length
  const waiting = live.filter((row) => row.status === 'pending').length
  return {
    total: live.length,
    done,
    toCome: live.length - done - waiting,
    waiting,
  }
}

/** The fields of a garage the inbox reads, as adminService.listVendors returns them. */
export interface GarageRow {
  id: string
  businessName: string
  status: string
  live: boolean
  bookingsPausedAt: Date | string | null
  deletedAt: Date | string | null
  documents: { toReview: number } | null
  readiness: Array<{ severity: 'blocking' | 'fix' | 'optional'; short: string }>
}

/**
 * Blocked from going live: a garage on its way in (Pending, or Active and
 * not yet live) that is not paused and has something blocking on its
 * checklist. Paused, suspended, archived and binned garages are where
 * someone put them on purpose, so they are not tasks.
 */
export function isBlocked(v: GarageRow): boolean {
  if (v.deletedAt || v.live || v.bookingsPausedAt) return false
  if (v.status !== 'pending' && v.status !== 'active') return false
  return v.readiness.some((item) => item.severity === 'blocking')
}

export function garageFigures(vendors: GarageRow[]): {
  live: number
  total: number
  blocked: number
  paused: number
  documentsToReview: number
} {
  const kept = vendors.filter((v) => !v.deletedAt)
  return {
    live: kept.filter((v) => v.live).length,
    // The same as the garage list's "All": everything but the Bin.
    total: kept.length,
    blocked: kept.filter(isBlocked).length,
    paused: kept.filter((v) => v.status === 'active' && v.bookingsPausedAt)
      .length,
    documentsToReview: kept.filter((v) => (v.documents?.toReview ?? 0) > 0)
      .length,
  }
}

export function garageTasks(vendors: GarageRow[]): TodayTask[] {
  const tasks: TodayTask[] = []
  for (const v of vendors) {
    if (v.deletedAt) continue
    const toReview = v.documents?.toReview ?? 0
    if (toReview > 0) {
      tasks.push({
        key: `documents:${v.id}`,
        kind: 'documents',
        group: 'garages',
        dueAt: null,
        since: null,
        late: false,
        vendorId: v.id,
        garageName: v.businessName,
        toReview,
      })
    }
    if (isBlocked(v)) {
      tasks.push({
        key: `garage_blocked:${v.id}`,
        kind: 'garage_blocked',
        group: 'garages',
        dueAt: null,
        since: null,
        late: false,
        vendorId: v.id,
        garageName: v.businessName,
        blocking: [
          ...new Set(
            v.readiness
              .filter((item) => item.severity === 'blocking')
              .map((item) => item.short)
          ),
        ],
      })
    }
  }
  return tasks
}
