/**
 * "Suggest another time": other times a garage offers instead of declining a
 * booking, as pure rules (0041). Clock-free: the caller passes `now`.
 *
 * Owner decisions (17 Oct 2026):
 *
 *   - Only on a pending booking that is paid: the garage has not accepted it
 *     yet, and the money is what makes it a booking the garage can see.
 *   - One to three times, each one the garage's own free time for this same
 *     job (same services, length and booking type, the notice rules and its
 *     bays, holidays and pause), worked out by the slot list itself; this file
 *     only checks the shape of the answer.
 *   - The customer picks one (the booking moves there, already accepted), or
 *     says none work (cancelled as the garage's decline, refunded in full).
 *   - Unanswered, it runs out at the earliest option less its booking type's
 *     notice — after that the soonest time can no longer be booked — or 12
 *     hours after it was made, whichever is sooner, and the booking is
 *     cancelled the same way.
 *   - One open at a time; the garage can take it back, which leaves the
 *     booking pending as it was.
 */
import { MIN_NOTICE_MS } from './slots.js'
import type { BookingType } from './booking-types.js'

/** The most times one suggestion can offer. */
export const MAX_PROPOSAL_SLOTS = 3

/** The longest a suggestion stays open before the booking is cancelled. */
export const PROPOSAL_MAX_OPEN_MS = 12 * 60 * 60 * 1000

/**
 * The least time the customer gets to answer. Times so close that the
 * suggestion would run out sooner than this are refused: the customer could
 * not reasonably see it in time, and the booking would just be cancelled.
 */
export const PROPOSAL_MIN_ANSWER_MS = 30 * 60 * 1000

/** How many run-out suggestions one cron run handles. */
export const PROPOSAL_SWEEP_LIMIT = 20

/** The longest note the garage can add ("Bay 2 is booked for a ceramic job"). */
export const PROPOSAL_NOTE_MAX_CHARS = 200

export type ProposalStatus = 'open' | 'accepted' | 'declined' | 'expired' | 'withdrawn' | 'closed'

/** Why a garage cannot suggest other times on a booking now. */
export type ProposalRefusal =
  /** Accepted, under way, finished, cancelled or moved. */
  | 'not_pending'
  /** Not paid: the garage never sees it, and nothing holds a slot. */
  | 'not_paid'
  /** There is already an open suggestion on it. */
  | 'already_open'

export function proposalRefusal(input: {
  status: string
  paymentStatus: string | null | undefined
  hasOpenProposal: boolean
}): ProposalRefusal | null {
  if (input.status !== 'pending') return 'not_pending'
  if (input.paymentStatus !== 'paid' && input.paymentStatus !== 'collected') return 'not_paid'
  if (input.hasOpenProposal) return 'already_open'
  return null
}

/** Why a set of times cannot be offered. */
export type SlotsRefusal =
  | 'none'
  | 'too_many'
  | 'invalid'
  | 'duplicate'
  /** The booking's own time: accept it instead. */
  | 'same_as_booked'
  /** So soon that the customer would have under PROPOSAL_MIN_ANSWER_MS to answer. */
  | 'too_soon'

/**
 * Checks the times a garage picked and returns them soonest first, as ISO.
 * Whether each is one of the garage's free times is the slot list's call
 * (the service checks every one against it).
 */
export function checkProposedSlots(
  slots: string[],
  booking: { scheduledAt: Date; bookingType: BookingType },
  now: number
): { ok: true; slots: string[]; expiresAt: Date } | { ok: false; refusal: SlotsRefusal } {
  if (slots.length === 0) return { ok: false, refusal: 'none' }
  if (slots.length > MAX_PROPOSAL_SLOTS) return { ok: false, refusal: 'too_many' }

  const times = slots.map((slot) => new Date(slot).getTime())
  if (times.some((time) => !Number.isFinite(time))) return { ok: false, refusal: 'invalid' }
  if (new Set(times).size !== times.length) return { ok: false, refusal: 'duplicate' }
  if (times.includes(booking.scheduledAt.getTime())) return { ok: false, refusal: 'same_as_booked' }

  const sorted = [...times].sort((a, b) => a - b)
  const expiresAt = proposalExpiresAt(sorted.map((t) => new Date(t).toISOString()), booking.bookingType, new Date(now))
  if (expiresAt.getTime() - now < PROPOSAL_MIN_ANSWER_MS) return { ok: false, refusal: 'too_soon' }

  return { ok: true, slots: sorted.map((t) => new Date(t).toISOString()), expiresAt }
}

/**
 * When an unanswered suggestion runs out: the earliest option less the
 * booking type's notice (after that it could not be booked), or 12 hours
 * after it was made, whichever is sooner.
 */
export function proposalExpiresAt(slots: string[], bookingType: BookingType, createdAt: Date): Date {
  const earliest = Math.min(...slots.map((slot) => new Date(slot).getTime()))
  return new Date(
    Math.min(earliest - MIN_NOTICE_MS[bookingType], createdAt.getTime() + PROPOSAL_MAX_OPEN_MS)
  )
}

/**
 * The options the customer can still pick: those that still give the
 * booking type's notice. The earliest drops out exactly when the suggestion
 * expires; a later one can drop out only after it, so in practice this is
 * every option while the suggestion is open.
 */
export function liveOptions(slots: string[], bookingType: BookingType, now: number): string[] {
  return slots.filter((slot) => new Date(slot).getTime() - now >= MIN_NOTICE_MS[bookingType])
}

/** A suggestion the customer can still answer. */
export function isProposalLive(
  proposal: { status: string; expiresAt: Date },
  bookingStatus: string,
  now: number
): boolean {
  return proposal.status === 'open' && bookingStatus === 'pending' && proposal.expiresAt.getTime() > now
}

/**
 * What the cron does with an open suggestion:
 *
 * - `expire`: it ran out with the booking still pending. The booking is
 *   cancelled as the garage's decline (full refund).
 * - `close`: the booking changed some other way (the customer cancelled or
 *   moved it, Detlio cancelled it). The suggestion is closed; nothing else.
 * - null: still open and in time.
 */
export function proposalSweepAction(
  proposal: { status: string; expiresAt: Date },
  bookingStatus: string,
  now: number
): 'expire' | 'close' | null {
  if (proposal.status !== 'open') return null
  if (bookingStatus !== 'pending') return 'close'
  if (proposal.expiresAt.getTime() <= now) return 'expire'
  return null
}

/** Why picking a time did not go through, in the order they are checked. */
export type PickRefusal =
  /** No open suggestion on this booking (withdrawn, answered or run out). */
  | 'not_open'
  /** Not one of the offered times. */
  | 'not_offered'
  /** One of the offered times, but too soon to book now. */
  | 'too_soon'

export function pickRefusal(
  proposal: { status: string; expiresAt: Date; slots: string[] } | null,
  bookingStatus: string,
  bookingType: BookingType,
  slot: string,
  now: number
): PickRefusal | null {
  if (!proposal || !isProposalLive(proposal, bookingStatus, now)) return 'not_open'
  const at = new Date(slot).getTime()
  if (!proposal.slots.some((option) => new Date(option).getTime() === at)) return 'not_offered'
  if (!liveOptions([slot], bookingType, now).length) return 'too_soon'
  return null
}

/** A suggestion as the customer's booking page and the garage's card show it. */
export interface ProposalRecord {
  id: string
  status: ProposalStatus
  slots: string[]
  note: string | null
  expiresAt: Date
  chosenSlot: Date | null
  resultBookingId: string | null
  resolvedAt: Date | null
  createdAt: Date
}

/** The newest suggestion of a booking's, if any (rows arrive in any order). */
export function latestProposal<T extends { createdAt: Date }>(proposals: T[] | null | undefined): T | null {
  if (!proposals || proposals.length === 0) return null
  return [...proposals].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
}

/**
 * The suggestion as the customer and the garage see it. `options` are the
 * times still on offer while it is live, and every time it offered once it
 * is answered (for the record).
 */
export function toProposalView(
  proposal: ProposalRecord,
  booking: { status: string; bookingType: BookingType },
  now: number
) {
  const live = isProposalLive(proposal, booking.status, now)
  return {
    id: proposal.id,
    // 'open' only while it can still be answered: one past its time but not
    // yet swept reads 'expired', and one whose booking changed reads 'closed'.
    status: live
      ? ('open' as const)
      : proposal.status === 'open'
        ? booking.status === 'pending'
          ? ('expired' as const)
          : ('closed' as const)
        : proposal.status,
    options: live ? liveOptions(proposal.slots, booking.bookingType, now) : proposal.slots,
    note: proposal.note,
    expiresAt: proposal.expiresAt.toISOString(),
    chosenSlot: proposal.chosenSlot?.toISOString() ?? null,
    resultBookingId: proposal.resultBookingId,
    resolvedAt: proposal.resolvedAt?.toISOString() ?? null,
    createdAt: proposal.createdAt.toISOString(),
  }
}

/** The cancellation reason a booking gets when none of the times worked. */
export const PROPOSAL_DECLINED_REASON = "None of the garage's suggested times worked for the customer"

/** The cancellation reason a booking gets when nobody picked a time in time. */
export const PROPOSAL_EXPIRED_REASON = "No time was picked from the garage's suggestions in time"

/** The reason a booking moved to a suggested time is retired with. */
export const PROPOSAL_MOVED_REASON = 'Moved to a time the garage suggested'
