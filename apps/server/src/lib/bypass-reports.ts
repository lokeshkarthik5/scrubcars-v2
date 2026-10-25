/**
 * "Did the garage ask you to book directly?" (0052): a customer tells Detlio
 * that a garage tried to take them off the platform, Detlio checks, and a
 * confirmed report rewards the customer and counts against the garage.
 *
 * Pure, unit-tested (bypass-reports.test.ts). The module
 * (modules/bypass-reports) reads rows, takes locks and writes what this
 * says. Words and the same numbers are twinned in
 * packages/core/src/bypass-reports.ts (bypass-reports.parity.test.ts).
 *
 * The rules (owner's brief, 18 Oct 2026; defaults written down in AGENTS.md):
 *
 *   - **Who and when**: the booking's own customer, from the moment the
 *     garage accepted it (`accepted_at`) until 30 days after it was
 *     completed. A booking the garage accepted and that was then cancelled
 *     can be reported for 30 days after the cancellation (a garage that
 *     cancels and says "book me directly" is the case this is for). Judged
 *     on the chain's latest row: a moved booking is its new row.
 *   - **Limits**: one report per booking (per reschedule chain), at most 5
 *     per customer in any 365 days.
 *   - **Anonymous to the garage**: nothing about a report ever reaches a
 *     garage payload, the portal, a push to the garage or a booking note.
 *     Only Detlio's admin sees who reported.
 *   - **Reward only on confirm**: when Detlio confirms a report (never on
 *     submission), the customer gets ₹100 of Detlio credit, at most once per
 *     customer per garage. While Detlio credit (GIFTS_ENABLED) is off, the
 *     reward is recorded as owed and granted by the cron once it is on.
 *   - **Strikes**: a garage's confirmed reports whose confirmation falls in
 *     the last 180 IST days, Test-marked bookings left out. Two or more are
 *     highlighted in admin, and reaching two alerts the team. Any strike
 *     makes the garage ineligible for Detlio Certified (lib/certification.ts
 *     `bypass` standard, the same window).
 *
 * Clock-free: every caller passes `now`.
 */
import { addDays, istDateKey, istMidnight } from './ist.js'

// ─── Numbers ─────────────────────────────────────────────────────────────────

/** Every number, in one place. Twinned in packages/core (parity test). */
export const BYPASS_RULES = {
  /** A booking can be reported until this many days after it ended. */
  reportWindowDays: 30,
  /** Reports one customer may make in any `yearDays` days. */
  maxReportsPerYear: 5,
  yearDays: 365,
  /** The reward for a confirmed report, in rupees: once per customer per garage. */
  rewardRupees: 100,
  /** Strikes are confirmed reports from the last this many IST days. */
  strikeWindowDays: 180,
  /** A garage with this many strikes is highlighted, and the team told. */
  strikeAlertAt: 2,
  /** The optional note's length. */
  noteMax: 500,
  /** A dismissal's reason (admin only). */
  dismissReasonMax: 300,
} as const

// ─── What happened ───────────────────────────────────────────────────────────

/** What the garage did, as the customer picks it (text + CHECK in 0052). */
export const BYPASS_KINDS = [
  'book_directly',
  'lower_price',
  'pay_directly',
  'gave_number',
  'other',
] as const
export type BypassKind = (typeof BYPASS_KINDS)[number]

export const BYPASS_KIND_LABELS: Record<BypassKind, string> = {
  book_directly: 'Asked me to book directly next time',
  lower_price: 'Offered a lower price outside Detlio',
  pay_directly: 'Asked me to pay cash or UPI directly',
  gave_number: 'Gave their number for future bookings',
  other: 'Something else',
}

export const BYPASS_STATUSES = ['new', 'confirmed', 'dismissed'] as const
export type BypassStatus = (typeof BYPASS_STATUSES)[number]

/**
 * Where a report's reward stands: none decided yet or none due (`none`),
 * owed until Detlio credit is on (`owed`), or added to the customer's credit
 * (`granted`). Text + CHECK in 0052.
 */
export const REWARD_STATUSES = ['none', 'owed', 'granted'] as const
export type RewardStatus = (typeof REWARD_STATUSES)[number]

// ─── Can this booking be reported? ───────────────────────────────────────────

/** The chain's latest row, as the window rule reads it. */
export interface ReportableBooking {
  status: string
  acceptedAt: Date | null
  completedAt: Date | null
  deliveredAt?: Date | null
  cancelledAt: Date | null
  scheduledAt: Date
}

export type WindowRefusal = 'not_accepted' | 'window_closed'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * When a booking stops being reportable, or null while it runs on (accepted
 * and not yet over). Completed: 30 days after completion (a pickup job's
 * delivery, or its slot for a row from before completion times were kept).
 * Cancelled after the garage accepted: 30 days after the cancellation.
 */
export function reportWindowEndsAt(booking: ReportableBooking): Date | null {
  const days = BYPASS_RULES.reportWindowDays * DAY_MS
  if (booking.status === 'completed') {
    const ended = booking.completedAt ?? booking.deliveredAt ?? booking.scheduledAt
    return new Date(ended.getTime() + days)
  }
  if (booking.status === 'cancelled') {
    const ended = booking.cancelledAt ?? booking.scheduledAt
    return new Date(ended.getTime() + days)
  }
  return null
}

/**
 * Why this booking can't be reported now, or null when it can: from the
 * garage's acceptance (a booking still waiting, or declined, never had the
 * garage in touch) until 30 days after it ended.
 */
export function reportWindowRefusal(booking: ReportableBooking, now: Date): WindowRefusal | null {
  const closed = () => {
    const endsAt = reportWindowEndsAt(booking)
    return endsAt && now.getTime() > endsAt.getTime() ? ('window_closed' as const) : null
  }
  switch (booking.status) {
    // Accepted by definition (a row from before 0028 has no accepted_at, so
    // the status is what tells).
    case 'confirmed':
    case 'in_progress':
      return null
    case 'completed':
      return closed()
    // Only once the garage had accepted it: a booking declined, or
    // cancelled while it waited, never had the garage on the job.
    case 'cancelled':
      return booking.acceptedAt ? closed() : 'not_accepted'
    default:
      return 'not_accepted'
  }
}

export type SubmitRefusal = WindowRefusal | 'already_reported' | 'limit_reached'

/**
 * Why a report can't be made, given what was read under the customer's
 * lock, or null when it can. The booking's window first (the reason the
 * customer can do least about), then one per booking, then the yearly cap.
 */
export function submitRefusal(input: {
  window: WindowRefusal | null
  alreadyReported: boolean
  /** The customer's reports made in the last `yearDays` days. */
  inLastYear: number
}): SubmitRefusal | null {
  if (input.window) return input.window
  if (input.alreadyReported) return 'already_reported'
  if (input.inLastYear >= BYPASS_RULES.maxReportsPerYear) return 'limit_reached'
  return null
}

/** Reports the customer has left in their 365 days, never below 0. */
export function reportsLeft(inLastYear: number): number {
  return Math.max(0, BYPASS_RULES.maxReportsPerYear - inLastYear)
}

/** The start of the rolling year the cap counts. */
export function yearStart(now: Date): Date {
  return new Date(now.getTime() - BYPASS_RULES.yearDays * DAY_MS)
}

// ─── The reward ──────────────────────────────────────────────────────────────

export type RewardDecision =
  | { kind: 'grant' }
  | { kind: 'owe' }
  | { kind: 'none'; why: 'no_account' | 'no_garage' | 'already_rewarded' }

/**
 * What confirming a report gives its customer: ₹100 of Detlio credit, once
 * per customer per garage. `alreadyRewarded` is whether another report of
 * theirs about this garage was already rewarded or is owed one. While credit
 * is off the reward is owed, and the cron grants it once credit is on. A
 * report whose account was deleted gets nothing (there is nobody to give it),
 * nor one whose garage was deleted forever (once per garage can no longer be
 * told).
 */
export function rewardDecision(input: {
  hasAccount: boolean
  hasGarage: boolean
  alreadyRewarded: boolean
  creditOn: boolean
}): RewardDecision {
  if (!input.hasAccount) return { kind: 'none', why: 'no_account' }
  if (!input.hasGarage) return { kind: 'none', why: 'no_garage' }
  if (input.alreadyRewarded) return { kind: 'none', why: 'already_rewarded' }
  return input.creditOn ? { kind: 'grant' } : { kind: 'owe' }
}

/** The reward in paise, for the ledger. */
export const REWARD_PAISE = BYPASS_RULES.rewardRupees * 100

/** What the customer's credit screen and admin read on the reward's ledger row. */
export function rewardReason(bookingRef: string | null): string {
  return bookingRef
    ? `Report about booking #${bookingRef} confirmed by Detlio`
    : 'Report confirmed by Detlio'
}

// ─── Strikes ─────────────────────────────────────────────────────────────────

/**
 * The first instant strikes count from: the start of the IST day 179 days
 * before today, so the window is 180 IST calendar days, today included (as
 * Detlio Certified's window is counted).
 */
export function strikeWindowStart(now: Date): Date {
  return istMidnight(addDays(istDateKey(now), -(BYPASS_RULES.strikeWindowDays - 1)))
}

/** Whether a confirmed report's confirmation counts as a strike now. */
export function isStrike(
  report: { status: BypassStatus; confirmedAt: Date | null; bookingMarkedTest?: boolean },
  now: Date
): boolean {
  if (report.status !== 'confirmed' || !report.confirmedAt) return false
  if (report.bookingMarkedTest) return false
  const at = report.confirmedAt.getTime()
  return at >= strikeWindowStart(now).getTime() && at <= now.getTime()
}

/** A garage's strikes now, from its reports. */
export function strikesOf(
  reports: ReadonlyArray<{ status: BypassStatus; confirmedAt: Date | null; bookingMarkedTest?: boolean }>,
  now: Date
): number {
  return reports.filter((report) => isStrike(report, now)).length
}

/** Highlighted in admin: 2 or more. */
export function strikesHighlighted(strikes: number): boolean {
  return strikes >= BYPASS_RULES.strikeAlertAt
}

/** Whether a confirmation took the garage to the alert line (told once, as it is reached). */
export function reachedStrikeAlert(before: number, after: number): boolean {
  return before < BYPASS_RULES.strikeAlertAt && after >= BYPASS_RULES.strikeAlertAt
}

// ─── Admin's moves ───────────────────────────────────────────────────────────

/** Confirm and Dismiss both start only from a new report: an answer is final. */
export const REVIEWABLE_FROM: readonly BypassStatus[] = ['new']
