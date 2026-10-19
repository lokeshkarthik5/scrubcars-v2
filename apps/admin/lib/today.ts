/**
 * The Today inbox on the panel's side: the shape GET /admin/today answers
 * (apps/server/src/modules/today), the menu's counts, and how each task
 * reads as a line. Pure, so the wording is unit-tested (today.test.ts).
 */
import { refundOwedAge } from '@repo/core/refunds'
import {
  ageText,
  deadlineText,
  formatCount,
  formatDateTime,
  formatMoney,
  type DeadlineText,
  type Urgency,
} from './format'

export type TodayGroup = 'bookings' | 'issues' | 'money' | 'garages'

interface TaskBase {
  key: string
  group: TodayGroup
  dueAt: string | null
  since: string | null
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

export type TodayTaskKind = TodayTask['kind']

export interface TodayCount {
  n: number
  late: number
}

export interface TodayScheduleItem {
  id: string
  reference: string
  scheduledAt: string
  status: string
  bookingType: string
  customerName: string | null
  garageName: string
  services: string
}

export interface AdminTodaySummary {
  now: string
  day: string
  tasks: TodayTask[]
  counts: Record<
    'today' | 'bookings' | 'issues' | 'refunds' | 'garages',
    TodayCount
  >
  headline: {
    bookingsToday: {
      total: number
      done: number
      toCome: number
      waiting: number
    }
    collectedToday: number | null
    garages: { live: number; total: number }
    openIssues: { total: number; complaintsLate: number }
  }
  schedule: TodayScheduleItem[]
  garages: {
    live: number
    blocked: number
    paused: number
    documentsToReview: number
  }
}

// ─── The menu's counts ──────────────────────────────────────────────────────

export interface NavCount {
  n: number
  /** Coral when any of it is late, amber when it needs someone today, grey for garages. */
  tone: 'late' | 'attention' | 'neutral'
}

export type NavCounts = Partial<
  Record<'today' | 'bookings' | 'issues' | 'refunds' | 'garages', NavCount>
>

export function navCounts(
  summary: Pick<AdminTodaySummary, 'counts'>
): NavCounts {
  const tone = (
    count: TodayCount,
    calm: NavCount['tone'] = 'attention'
  ): NavCount['tone'] => (count.late > 0 ? 'late' : calm)
  const { counts } = summary
  return {
    today: { n: counts.today.n, tone: tone(counts.today) },
    bookings: { n: counts.bookings.n, tone: tone(counts.bookings) },
    issues: { n: counts.issues.n, tone: tone(counts.issues) },
    refunds: { n: counts.refunds.n, tone: tone(counts.refunds) },
    garages: { n: counts.garages.n, tone: tone(counts.garages, 'neutral') },
  }
}

// ─── The inbox's filter tabs ────────────────────────────────────────────────

export const TODAY_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'bookings', label: 'Bookings' },
  { value: 'issues', label: 'Issues' },
  { value: 'money', label: 'Money' },
  { value: 'garages', label: 'Garages' },
] as const

export type TodayFilter = (typeof TODAY_FILTERS)[number]['value']

export function filterTasks(
  tasks: TodayTask[],
  filter: TodayFilter
): TodayTask[] {
  return filter === 'all'
    ? tasks
    : tasks.filter((task) => task.group === filter)
}

export function filterCount(tasks: TodayTask[], filter: TodayFilter): number {
  return filterTasks(tasks, filter).length
}

// ─── Refunds owed ───────────────────────────────────────────────────────────

/**
 * How urgent a refund owed is, by the Refunds page's own rule
 * (refundOwedAge): coral once it is late, amber from a day, grey before.
 */
export function refundUrgency(since: string | null, now: number): Urgency {
  if (!since) return 'attention'
  if (refundOwedAge(since, now).late) return 'late'
  return now - Date.parse(since) >= 24 * 60 * 60 * 1000
    ? 'attention'
    : 'neutral'
}

/** "Owed 2 days", worded as the Refunds page words it. */
export function refundChip(since: string | null, now: number): DeadlineText {
  const label = refundOwedAge(since, now).label
  return {
    text: label.charAt(0).toUpperCase() + label.slice(1),
    urgency: refundUrgency(since, now),
  }
}

// ─── One task as a line ─────────────────────────────────────────────────────

export type TaskAction =
  | { kind: 'call'; label: string; phone: string; name: string }
  | { kind: 'acknowledge'; label: string; complaintId: string }
  | { kind: 'link'; label: string; href: string }

export interface TaskLine {
  /** What kind of thing it is, for the small label on a phone ("Booking"). */
  what: string
  title: string
  detail: string
  chip: DeadlineText
  /** Where Open goes. */
  href: string
  /** The one button that does the next step, beside Open (or instead of it). */
  action: TaskAction | null
}

const join = (...parts: Array<string | null | undefined | false>) =>
  parts.filter(Boolean).join(' · ')

export function taskLine(task: TodayTask, now: number): TaskLine {
  switch (task.kind) {
    case 'booking_waiting':
      return {
        what: 'Booking',
        title: `${task.garage.name} hasn’t accepted #${task.reference}`,
        detail: join(
          task.customerName,
          task.services,
          `${formatMoney(task.amount)} paid`,
          formatDateTime(task.scheduledAt, now)
        ),
        chip: task.dueAt
          ? // The garage's deadline to accept (0042), worded as the Bookings
            // page words it; a booking from before it has only its slot.
            deadlineText(task.dueAt, now, {
              verb: task.dueAt === task.scheduledAt ? 'Starts' : 'Accept',
            })
          : { text: 'Waiting', urgency: 'attention' },
        href: `/bookings/${task.bookingId}`,
        action: {
          kind: 'call',
          label: 'Call garage',
          phone: task.garage.phone,
          name: task.garage.name,
        },
      }
    case 'complaint':
      return {
        what: 'Complaint',
        title: `Complaint ${task.number}: “${task.message}”`,
        detail: join(
          task.customerName,
          task.garageName,
          task.stage === 'acknowledge'
            ? 'not acknowledged'
            : 'acknowledged, not resolved'
        ),
        chip: task.dueAt
          ? deadlineText(task.dueAt, now, {
              verb: task.stage === 'acknowledge' ? 'Acknowledge' : 'Resolve',
            })
          : { text: 'Open', urgency: 'attention' },
        href: `/complaints/${task.complaintId}`,
        action:
          task.stage === 'acknowledge'
            ? {
                kind: 'acknowledge',
                label: 'Acknowledge',
                complaintId: task.complaintId,
              }
            : null,
      }
    case 'redo_claim':
      return {
        what: 'Redo claim',
        title: `Redo claim on #${task.bookingRef}${task.issues ? `: ${task.issues}` : ''}`,
        detail: join(task.customerName, task.garageName),
        chip: task.dueAt
          ? deadlineText(task.dueAt, now, { verb: 'Decide' })
          : task.since
            ? ageText(task.since, now, 'Waiting')
            : { text: 'To decide', urgency: 'attention' },
        href: `/guarantee/${task.claimId}`,
        action: {
          kind: 'link',
          label: 'Decide',
          href: `/guarantee/${task.claimId}`,
        },
      }
    case 'bypass_report':
      return {
        what: 'Bypass report',
        title: `Bypass report: “${task.kindLabel}”`,
        detail: join(
          task.customerName,
          task.garageName,
          task.strikes > 0 &&
            `${task.strikes} ${task.strikes === 1 ? 'strike' : 'strikes'}`
        ),
        chip: task.since
          ? ageText(task.since, now, 'Waiting')
          : { text: 'New', urgency: 'attention' },
        href: `/bypass-reports/${task.reportId}`,
        action: {
          kind: 'link',
          label: 'Review',
          href: `/bypass-reports/${task.reportId}`,
        },
      }
    case 'refund_owed':
      return {
        what: 'Refund',
        title: `Refund ${formatMoney(task.amountOwed)} to ${task.customerName}`,
        detail: join(
          `#${task.reference}`,
          task.garageName,
          task.razorpayPaymentId
        ),
        chip: refundChip(task.since, now),
        href: task.bookingId ? `/bookings/${task.bookingId}` : '/refunds',
        action: { kind: 'link', label: 'Refund now', href: '/refunds' },
      }
    case 'payouts_due':
      return {
        what: 'Payouts',
        title: `Payouts: ${task.garages} ${task.garages === 1 ? 'garage' : 'garages'}, ${formatMoney(task.total)}`,
        detail: task.late
          ? 'Past the 24-hour payout cycle'
          : 'Within the 24-hour payout cycle',
        chip: task.since
          ? ageText(task.since, now, 'Due')
          : { text: 'Due', urgency: 'attention' },
        href: '/payouts',
        action: null,
      }
    case 'documents':
      return {
        what: 'Garage',
        title: `${task.garageName}: ${formatCount(task.toReview)} ${task.toReview === 1 ? 'document' : 'documents'} to review`,
        detail: 'Uploaded by the garage, waiting for Detlio to check them',
        chip: { text: `${task.toReview} waiting`, urgency: 'neutral' },
        href: `/vendors/${task.vendorId}/edit?tab=documents`,
        action: {
          kind: 'link',
          label: 'Review',
          href: `/vendors/${task.vendorId}/edit?tab=documents`,
        },
      }
    case 'garage_blocked':
      return {
        what: 'Garage',
        title: `${task.garageName} can’t take bookings`,
        detail:
          task.blocking.length > 0
            ? `Missing: ${task.blocking.join(', ')}`
            : 'Something blocks it going live',
        chip: { text: 'Blocked', urgency: 'neutral' },
        href: `/vendors/${task.vendorId}/edit`,
        action: {
          kind: 'link',
          label: 'Fix',
          href: `/vendors/${task.vendorId}/edit`,
        },
      }
  }
}

/** "9 things need you today" / "1 thing needs you" / "Nothing needs you". */
export function inboxTitle(count: number): string {
  if (count === 0) return 'Nothing needs you right now'
  return count === 1
    ? '1 thing needs you today'
    : `${formatCount(count)} things need you today`
}

/** "2 are late. Work top to bottom: the list is ordered by deadline." */
export function inboxSubtitle(late: number, count: number): string {
  if (count === 0)
    return 'Every booking, issue, refund and garage is up to date.'
  const lead =
    late === 0
      ? 'None are late.'
      : late === 1
        ? '1 is late.'
        : `${formatCount(late)} are late.`
  return `${lead} Work top to bottom: the list is ordered by deadline.`
}
