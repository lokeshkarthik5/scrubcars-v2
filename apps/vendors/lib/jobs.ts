import { jobSummary, serviceLinesOf } from '@repo/core/add-ons'
import { contactWindowState } from '@repo/core/contact-window'
import { formatClock, formatDay, formatINR } from '@repo/core/format'
import { garageBookingInspectionPrice } from '@repo/core/inspection-booking'
import {
  GARAGE_AFTER_GRACE_MINUTES,
  MIN_GARAGE_PHOTOS,
  photoGateMessage,
  photosOf,
} from '@repo/core/job-photo-standards'
import { msg, t, tn } from '@repo/core/i18n/translate'
import { CAR_CHECK_ANGLES, carCheckGateLines } from '@repo/core/condition-check'
import { PICKUP_STEP_LABELS, type PickupNext } from '@repo/core/pickup'
import type { Booking } from '@repo/core/types'

/**
 * How the garage portal sorts and reads its jobs (UX audit, garage findings
 * 1, 9 and 10): which list a job is on, what is most urgent, and the one
 * next step each job waits for. Pure; the clock is passed in, and every day
 * is India's calendar whatever the device says.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** Days since the epoch on India's calendar, so two moments compare by date. */
export function istDay(time: number): number {
  return Math.floor((time + IST_OFFSET_MS) / DAY_MS)
}

const at = (iso: string | undefined | null): number =>
  iso ? new Date(iso).getTime() : NaN

/** The Bookings page's four lists, in short words that leave room for Tamil. */
export type ListTab = 'today' | 'new' | 'later' | 'done'
export const LIST_TABS: readonly ListTab[] = ['today', 'new', 'later', 'done']

/**
 * A `?tab=` from a link. The old names still arrive from notifications sent
 * before this change (and from the server's push links, which say
 * incoming / upcoming / completed / cancelled), so they map onto the new
 * lists rather than falling back to the first.
 */
export function tabFromQuery(value: string | null): ListTab | null {
  switch (value) {
    case 'today':
    case 'new':
    case 'later':
    case 'done':
      return value
    case 'incoming':
      return 'new'
    case 'upcoming':
      return 'today'
    case 'completed':
    case 'cancelled':
      return 'done'
    default:
      return null
  }
}

/**
 * The Bookings switch: the four lists, then the calendar (an icon-only fifth
 * segment). The calendar is not a list, so LIST_TABS stays the four.
 */
export type BookingsTab = ListTab | 'calendar'

/** A `?tab=` from a link: `calendar`, or anything tabFromQuery reads. */
export function bookingsTabFromQuery(value: string | null): BookingsTab | null {
  return value === 'calendar' ? 'calendar' : tabFromQuery(value)
}

/**
 * Which list a job is on. Waiting for an answer: New. Under way, or
 * accepted for today (or a day already gone, still not started): Today.
 * Accepted for a later day: Later. Finished or cancelled: Done. A booking
 * moved to a new time is on no list: its new booking is.
 */
export function listTabOf(b: Booking, now: number): ListTab | null {
  switch (b.status) {
    case 'pending':
      return 'new'
    case 'in_progress':
      return 'today'
    case 'confirmed':
      return istDay(at(b.scheduledAtIso)) <= istDay(now) ? 'today' : 'later'
    case 'completed':
    case 'cancelled':
      return 'done'
    default:
      return null
  }
}

/** The garage suggested other times and waits for the customer; nothing to press. */
export function proposalOpen(b: Booking): boolean {
  return (
    b.status === 'pending' &&
    (b.timeProposal?.status === 'open' || b.timeProposal?.status === 'expired')
  )
}

/** A pending job whose start time has come and gone: it can only be declined. */
export function slotPassed(b: Booking, now: number): boolean {
  return b.status === 'pending' && at(b.scheduledAtIso) <= now
}

/** The garage's time to answer has run out and the server is cancelling the booking. */
export function responseRunOut(b: Booking, now: number): boolean {
  return Boolean(
    b.responseDeadline?.enforced && at(b.responseDeadline.respondBy) <= now
  )
}

/** A new booking the garage can still answer: not waiting on the customer, not lost. */
export function needsAnswer(b: Booking, now: number): boolean {
  return b.status === 'pending' && !proposalOpen(b) && !responseRunOut(b, now)
}

/**
 * The time a new booking must be answered by, for sorting: its deadline, or
 * the slot itself for one with none (older bookings, pay later).
 */
function answerBy(b: Booking): number {
  const deadline = at(b.responseDeadline?.respondBy)
  return Number.isNaN(deadline) ? at(b.scheduledAtIso) : deadline
}

/**
 * New bookings, most urgent first: the ones to answer by the time left,
 * then the ones waiting on the customer (suggested times) or already lost.
 */
export function sortByUrgency(
  bookings: readonly Booking[],
  now: number
): Booking[] {
  return [...bookings].sort((a, b) => {
    const rank = (job: Booking) => (needsAnswer(job, now) ? 0 : 1)
    return rank(a) - rank(b) || answerBy(a) - answerBy(b)
  })
}

/** How many new bookings wait for an answer, and the least time left on one (ms), if any has a clock. */
export function waitingSummary(
  bookings: readonly Booking[],
  now: number
): { count: number; soonestMs: number | null } {
  let count = 0
  let soonest: number | null = null
  for (const b of bookings) {
    if (!needsAnswer(b, now)) continue
    count++
    const deadline = at(b.responseDeadline?.respondBy)
    if (!Number.isNaN(deadline) && deadline > now) {
      soonest =
        soonest === null ? deadline - now : Math.min(soonest, deadline - now)
    }
  }
  return { count, soonestMs: soonest }
}

export interface TodayView {
  /** Under way, oldest start first. */
  working: Booking[]
  /** Accepted for today (or overdue and not started), in time order. */
  next: Booking[]
  /** Accepted for tomorrow: folded into one row. */
  tomorrow: number
}

export function todayView(
  bookings: readonly Booking[],
  now: number
): TodayView {
  const today = istDay(now)
  const working = bookings
    .filter((b) => b.status === 'in_progress')
    .sort(
      (a, b) =>
        at(a.startedAtIso ?? a.scheduledAtIso) -
        at(b.startedAtIso ?? b.scheduledAtIso)
    )
  const next = bookings
    .filter(
      (b) => b.status === 'confirmed' && istDay(at(b.scheduledAtIso)) <= today
    )
    .sort((a, b) => at(a.scheduledAtIso) - at(b.scheduledAtIso))
  const tomorrow = bookings.filter(
    (b) =>
      b.status === 'confirmed' && istDay(at(b.scheduledAtIso)) === today + 1
  ).length
  return { working, next, tomorrow }
}

/** "Mon 19 Oct", never "Today": the date itself, for a heading that already says now. */
export function calendarDate(time: number): string {
  // India's wall clock, read off a shifted UTC date, as @repo/core/format does.
  const clock = new Date(time + IST_OFFSET_MS)
  return `${WEEKDAYS[clock.getUTCDay()]} ${clock.getUTCDate()} ${MONTHS[clock.getUTCMonth()]}`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/** Accepted jobs on later days, a group per day, in time order. */
export function laterDays(
  bookings: readonly Booking[],
  now: number
): { day: string; jobs: Booking[] }[] {
  const today = istDay(now)
  const later = bookings
    .filter(
      (b) => b.status === 'confirmed' && istDay(at(b.scheduledAtIso)) > today
    )
    .sort((a, b) => at(a.scheduledAtIso) - at(b.scheduledAtIso))
  const groups: { key: number; day: string; jobs: Booking[] }[] = []
  for (const b of later) {
    const key = istDay(at(b.scheduledAtIso))
    const last = groups[groups.length - 1]
    if (last?.key === key) last.jobs.push(b)
    else groups.push({ key, day: formatDay(b.scheduledAtIso, now), jobs: [b] })
  }
  return groups.map(({ day, jobs }) => ({ day, jobs }))
}

/** Finished and cancelled jobs, the most recent first (a moved one's new booking stands for it). */
export function doneJobs(bookings: readonly Booking[]): Booking[] {
  return bookings
    .filter((b) => b.status === 'completed' || b.status === 'cancelled')
    .sort(
      (a, b) =>
        at(b.completedAtIso ?? b.scheduledAtIso) -
        at(a.completedAtIso ?? a.scheduledAtIso)
    )
}

/**
 * How many of the Done list's jobs are today's: finished today, or (a
 * cancelled or no-show booking, which has no finish time) booked for today.
 * The same time the list orders them by, read on India's calendar.
 */
export function doneTodayCount(done: readonly Booking[], now: number): number {
  const today = istDay(now)
  return done.filter(
    (b) => istDay(at(b.completedAtIso ?? b.scheduledAtIso)) === today
  ).length
}

/**
 * The Bookings switch's quiet second lines (owner, 10 Nov 2026; mockup
 * garage-calendar A): Today "3 jobs", New "2 waiting" (in red on the
 * switch, where the red number badge was), Later "5 jobs", Done "1 today".
 * Done counts only today's (doneTodayCount): the whole list goes back for
 * ever, and calling that "today" would be untrue.
 */
export function bookingsTabLines(
  counts: Readonly<Record<ListTab, number>>,
  doneToday: number
): Record<ListTab, string> {
  const jobs = (n: number) => tn(n, '{count} job', '{count} jobs')
  return {
    today: jobs(counts.today),
    new: t('{count} waiting', { count: counts.new }),
    later: jobs(counts.later),
    done: t('{count} today', { count: doneToday }),
  }
}

/** What the job is worth: its services at their booked prices (a free redo is ₹0). */
export function jobPrice(b: Booking): number {
  if (b.guaranteeRedo) return 0
  return b.items.reduce((sum, item) => sum + Number(item.amount || 0), 0)
}

/**
 * The job's price as its card says it: jobPrice in rupees, or for an
 * inspection with no fee (0073) "Price on inspection · bill not sent" until
 * the garage sends its final bill, then the bill's total. `words` is true
 * while it is words, so a card can set it smaller than a figure.
 */
export function jobPriceText(b: Booking): { text: string; words: boolean } {
  const inspection = garageBookingInspectionPrice(b)
  if (inspection) return { text: inspection.text, words: inspection.amount === null }
  return { text: formatINR(jobPrice(b)), words: false }
}

/** "Foam wash + Interior vacuum", or the server's "Full wash + 2 more" past two. */
export function servicesLine(b: Booking): string {
  // With add-ons, the server's "Foam wash + 2 add-ons": one line on a list row.
  if (b.items.length > 0 && b.items.length <= 2 && !b.items.some((item) => item.isAddon))
    return b.items.map((item) => item.name).join(' + ')
  return b.serviceSummary
}

/**
 * The services alone, where each add-on gets its own marked line below
 * (JobAddOnLines): the new booking card and the job's page.
 */
export function serviceOnlyLine(b: Booking): string {
  const items = serviceLinesOf(b.items)
  return servicesLine({ ...b, items, serviceSummary: jobSummary(items) || b.serviceSummary })
}

/** "Rahul V.": first name and the surname's initial, for tight rows. */
export function shortName(name: string | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return t('Customer')
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`
}

export function firstName(name: string | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] || t('the customer')
}

/** Straight-line km from the garage's pin to a doorstep or pickup address, to a tenth under 10 km. */
export function distanceKm(b: Booking): number | null {
  const from = b.garage
  const to = b.jobLocation
  if (
    !from ||
    !to ||
    from.lat === null ||
    from.lng === null ||
    to.lat === null ||
    to.lng === null
  ) {
    return null
  }
  const rad = (deg: number) => (deg * Math.PI) / 180
  const dLat = rad(to.lat - from.lat)
  const dLng = rad(to.lng - from.lng)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2
  const km = 2 * 6371 * Math.asin(Math.sqrt(a))
  return km < 10 ? Math.round(km * 10) / 10 : Math.round(km)
}

/**
 * The one quiet line about the customer's number on a new booking:
 * "Customer's number shows from 7:00 am tomorrow". Null once it shows (the
 * job page has Call) and on a job that's over.
 */
export function customerNumberLine(b: Booking, now: number): string | null {
  if (b.status === 'cancelled' || b.status === 'rescheduled') return null
  const state = contactWindowState(b.contactWindow, now)
  if (state === 'open') return null
  if (state === 'after' || !b.contactWindow)
    return t("Customer's number is hidden after the job.")
  const opens = b.contactWindow.opensAt
  const day = formatDay(opens, now)
  const time = formatClock(opens)
  if (day === 'Today') return t("Customer's number shows from {time}", { time })
  if (day === 'Tomorrow')
    return t("Customer's number shows from {time} tomorrow", { time })
  return t("Customer's number shows from {time} on {day}", { time, day })
}

/** The garage's photos of one stage, and how many the standard asks for (0 when it doesn't). */
export function photoCount(
  b: Booking,
  stage: 'before' | 'after'
): { have: number; need: number } {
  const required = Boolean(b.photoStandard?.required && !b.photoStandard.waived)
  return {
    have: photosOf(b.jobPhotos, 'garage', stage).length,
    need: required ? MIN_GARAGE_PHOTOS : 0,
  }
}

/** What a job waits for next, as its row's one button says it. */
export type NextStep =
  | { kind: 'photos'; stage: 'before' | 'after'; have: number; need: number }
  | { kind: 'start' }
  | { kind: 'complete' }
  | { kind: 'pickup'; step: PickupNext }
  | { kind: 'wait'; text: string }

/**
 * The car condition check's walk-round as a row's step (0075): its photos
 * while angles are missing (then "Check the marks" sends it). Null when the
 * check does not hold the job.
 */
function carCheckStep(b: Booking): NextStep | null {
  const gate = b.conditionCheck?.gate
  if (!gate) return null
  return {
    kind: 'photos',
    stage: 'before',
    have: b.conditionCheck?.taken.before ?? 0,
    need: CAR_CHECK_ANGLES.length,
  }
}

export function nextStep(b: Booking): NextStep | null {
  if (b.bookingType === 'pickup') {
    const step = b.pickup?.nextStep
    if (!step) return null
    if (step === 'picked_up') {
      const check = carCheckStep(b)
      if (check) return check
    }
    if (step === 'start_work' && b.photoStandard?.startBlocked) {
      return { kind: 'photos', stage: 'before', ...photoCount(b, 'before') }
    }
    if (
      (step === 'out_for_delivery' || step === 'delivered') &&
      b.photoStandard?.finishBlocked
    ) {
      return { kind: 'photos', stage: 'after', ...photoCount(b, 'after') }
    }
    return { kind: 'pickup', step }
  }
  if (b.status === 'confirmed') {
    const check = carCheckStep(b)
    if (check) return check
    if (b.photoStandard?.startBlocked)
      return { kind: 'photos', stage: 'before', ...photoCount(b, 'before') }
    return { kind: 'start' }
  }
  if (b.status === 'in_progress') {
    if (b.completeBlockedByExtraWork) {
      return {
        kind: 'wait',
        text: t('Waiting for {name} to answer the extra work', {
          name: firstName(b.customerName),
        }),
      }
    }
    if (b.photoStandard?.finishBlocked)
      return { kind: 'photos', stage: 'after', ...photoCount(b, 'after') }
    return { kind: 'complete' }
  }
  return null
}

/** The row's button words for a step. */
export function nextStepLabel(step: NextStep): string {
  switch (step.kind) {
    case 'photos': {
      const vars = { have: Math.min(step.have, step.need), need: step.need }
      return step.stage === 'before'
        ? t('Before photos {have}/{need}', vars)
        : t('After photos {have}/{need}', vars)
    }
    case 'start':
      return t('Start job')
    case 'complete':
      return t('Complete job')
    case 'pickup':
      return step.step === 'start_work'
        ? t('Start job')
        : t('Next: {step}', { step: t(PICKUP_STEP_LABELS[step.step]) })
    case 'wait':
      return step.text
  }
}

/**
 * What still stands between the job and its main button, one line each,
 * for the checklist beside it. The photo line is the server's own words
 * ("Add 1 more after photo to complete."); empty when the button can go.
 */
export function blockers(b: Booking, action: 'start' | 'complete'): string[] {
  const lines: string[] = []
  const photoBlock =
    action === 'start'
      ? b.photoStandard?.startBlocked
      : b.photoStandard?.finishBlocked
  if (photoBlock) lines.push(photoGateMessage(photoBlock))
  // The car condition check (0075) holds a doorstep job's Start (pickup &
  // drop's is Picked up, on its own step).
  if (action === 'start' && b.bookingType !== 'pickup') {
    lines.push(...carCheckGateLines(b.conditionCheck?.gate ?? null))
  }
  if (action === 'complete' && b.completeBlockedByExtraWork) {
    lines.push(
      t('{name} to answer the extra work', { name: firstName(b.customerName) })
    )
  }
  return lines
}

/** The job page's progress line for a job at the garage or the door (shown as `t(label)`). */
export const PROGRESS_STEPS = [
  msg('Accepted'),
  msg('Before'),
  msg('Working'),
  msg('After'),
  msg('Done'),
] as const

/**
 * Where a job is on that line: the index of the step in hand (every step
 * before it is done), or PROGRESS_STEPS.length once it is finished. Null for
 * a booking not accepted yet, or one that's over without being done.
 */
export function progressIndex(b: Booking): number | null {
  if (b.status === 'completed') return PROGRESS_STEPS.length
  if (b.status === 'confirmed') return 1
  if (b.status === 'in_progress') return photoCount(b, 'after').have > 0 ? 3 : 2
  return null
}

/** The stage of photos the job is on now: before until it starts, after once it has. */
export function photoStage(b: Booking): 'before' | 'after' {
  return b.status === 'confirmed' ? 'before' : 'after'
}

/**
 * Whether the garage can still change a stage's photos, as the server says
 * (`photoStandard`, 0045: before photos until the job is completed, after
 * photos for an hour after). The page re-reads every 10 seconds, so the hour
 * is counted here too, from the completion time, rather than waiting for it.
 */
export function photosOpen(
  b: Booking,
  stage: 'before' | 'after',
  now: number
): boolean {
  if (b.photoStandard && !b.photoStandard[stage].canChange) return false
  if (stage === 'after' && b.status === 'completed') {
    const finished = at(b.completedAtIso ?? b.scheduledAtIso)
    return now - finished <= GARAGE_AFTER_GRACE_MINUTES * 60 * 1000
  }
  return b.status !== 'completed' || stage === 'after'
}
