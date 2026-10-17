import { AppError } from '../../lib/errors.js'
import {
  RESPONSE_SWEEP_LIMIT,
  isOverdueUnanswered,
  responseTimePassed,
  type SweepCandidate,
} from '../../lib/response-deadline.js'

/**
 * The auto-cancel's rules over the reads and writes it is given (0042):
 * garage-response.service.ts passes the real repositories and the switch,
 * the unit tests pass stand-ins. No database or env import here.
 */

/**
 * The garage's Accept (or Suggest times) after its time to answer ran out:
 * 409, whatever the cron has done so far, since the booking is being — or
 * has been — cancelled and refunded.
 */
export function responseTimePassedError() {
  return new AppError(
    409,
    'Your time to accept this booking has run out, so it is being cancelled and the customer refunded in full.',
    'RESPONSE_TIME_PASSED'
  )
}

/**
 * Refuses the garage's answer when it comes too late (lib/response-deadline.ts
 * responseTimePassed): the cron cancelled the booking for it already, or
 * `enforced` (AUTO_CANCEL_UNANSWERED) and the deadline has passed.
 */
export function assertCanStillAnswer(
  booking: { status: string; respondBy?: Date | null; responseMissedAt?: Date | null },
  enforced: boolean,
  now: number
): void {
  const late = responseTimePassed(
    { status: booking.status, respondBy: booking.respondBy ?? null, responseMissedAt: booking.responseMissedAt ?? null },
    enforced,
    now
  )
  if (late) throw responseTimePassedError()
}

/** A booking the sweep may cancel, as the store reads it. */
export interface OverdueRow extends SweepCandidate {
  id: string
}

export interface GarageResponseStore {
  /** Overdue paid pending bookings, oldest deadline first, at most `limit`. */
  listOverdue(now: Date, limit: number): Promise<OverdueRow[]>
  /**
   * The conditional cancel (bookingsRepository.cancelNotAcceptedInTime).
   * False when the booking no longer qualified at the moment of writing: the
   * garage accepted, the customer cancelled, a suggestion went in.
   */
  cancel(bookingId: string, at: Date): Promise<boolean>
}

export type SweepSummary =
  | { enabled: false }
  | { enabled: true; candidates: number; cancelled: number; skipped: number; failed: number }

export function garageResponseWith(deps: {
  store: GarageResponseStore
  /** AUTO_CANCEL_UNANSWERED. Off: nothing is read or cancelled. */
  enabled: boolean
  /** After each cancel commits: alert, analytics, the automatic refund. Never fails the sweep. */
  afterCancel: (bookingId: string) => Promise<void>
  onError?: (error: unknown, bookingId: string, step: 'cancel' | 'after_cancel') => void
}) {
  return {
    /**
     * The pending-digest cron's sweep: paid pending bookings their garage did
     * not answer in time are cancelled as not accepted in time, at most
     * RESPONSE_SWEEP_LIMIT a run, oldest deadline first. Runs in quiet hours
     * too: cancelling is not a message. A dry run only counts.
     */
    async sweep(options: { dryRun: boolean }, now = new Date()): Promise<SweepSummary> {
      if (!deps.enabled) return { enabled: false }
      const rows = await deps.store.listOverdue(now, RESPONSE_SWEEP_LIMIT)
      const summary = { enabled: true as const, candidates: rows.length, cancelled: 0, skipped: 0, failed: 0 }
      if (options.dryRun) return summary

      for (const row of rows) {
        // The SQL chose it; the pure rule must agree, or it is left alone.
        if (!isOverdueUnanswered(row, now.getTime())) {
          summary.skipped += 1
          continue
        }
        let cancelled: boolean
        try {
          cancelled = await deps.store.cancel(row.id, now)
        } catch (error) {
          summary.failed += 1
          deps.onError?.(error, row.id, 'cancel')
          continue
        }
        if (!cancelled) {
          summary.skipped += 1
          continue
        }
        summary.cancelled += 1
        // Committed already: what follows is telling people and the refund,
        // and a problem there is logged, never counted as a failed cancel.
        await deps.afterCancel(row.id).catch((error: unknown) => deps.onError?.(error, row.id, 'after_cancel'))
      }
      return summary
    },
  }
}
