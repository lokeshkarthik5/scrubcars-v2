/**
 * The garage Bin's rules: what moving a garage there cancels, what deleting
 * it forever does with what is left, and the words for each refusal.
 *
 * Owner decisions (16 Oct 2026) behind them:
 *
 * - Archive and the Bin are different things. Archive only hides a garage
 *   from customers. The Bin is for garages being deleted: off the app for
 *   customers and for the garage's own team, until someone restores it or
 *   deletes it forever. Nothing in the Bin is deleted on its own.
 * - A garage with bookings still to come can go to the Bin. Those bookings
 *   are cancelled by Detlio on the way in, through the same admin cancel as
 *   anywhere else, so a paid one becomes a refund owed exactly as today
 *   (lib/refunds.ts). Nothing is refunded automatically.
 * - Delete forever removes the garage and its bookings. Real money is kept
 *   for the accounts: lib/data-reset.ts decides which booking chains and
 *   checkouts carry it, as it does for Start pilot clean, so the two can
 *   never disagree. When something is kept the garage row stays behind as a
 *   tombstone with its name and address, which those receipts print.
 *
 * Pure: the service reads the rows and passes them in.
 */
import { AppError } from './errors.js'
import type { ResetPlan } from './data-reset.js'

/** The reason every booking cancelled by moving its garage to the Bin carries. */
export const GARAGE_REMOVED_REASON = 'Garage removed'

/**
 * What a booking cancelled by the Bin is, in the admin cancel's own terms:
 * Detlio's own decision (not the customer's or the garage's), for the reason
 * above. A paid one is then owed back in full, as any Detlio cancellation is.
 */
export const BIN_CANCELLATION = { onBehalfOf: 'detlio', reason: GARAGE_REMOVED_REASON } as const

/** Bookings still to happen: the ones moving a garage to the Bin cancels. */
export const UPCOMING_STATUSES = ['pending', 'confirmed', 'in_progress'] as const

export function isUpcoming(status: string): boolean {
  return (UPCOMING_STATUSES as readonly string[]).includes(status)
}

/**
 * Paid, for the Bin's preview: money taken that the cancel will make a
 * refund owed. A pending or failed payment has nothing to give back.
 */
export function isPaid(payment: { status: string } | null | undefined): boolean {
  return payment?.status === 'paid'
}

/** "3 upcoming bookings, 2 paid" as counts, for the dialog and the audit. */
export function upcomingSummary(bookings: Array<{ payment: { status: string } | null }>) {
  return {
    count: bookings.length,
    paid: bookings.filter((booking) => isPaid(booking.payment)).length,
  }
}

// ─── Delete forever ──────────────────────────────────────────────────────────

/**
 * What deleting a garage forever does, once its bookings are planned:
 *
 * - `hard_delete`: nothing is kept, so the garage row goes too, with its
 *   services, photos, hours and team seats.
 * - `tombstone`: a chain or checkout is kept for its money. Its bookings
 *   still point at the garage and at the services they were for, so the
 *   garage row stays as a tombstone (`purged_at`): name and address kept for
 *   the receipts, everything else about it removed or cleared.
 * - `partial`: the garage has more bookings than one run deletes (the reset's
 *   per-run cap). This run deletes the oldest it may and leaves the garage in
 *   the Bin; pressing Delete forever again carries on.
 */
export type PurgeOutcome = 'hard_delete' | 'tombstone' | 'partial'

export function purgeOutcome(
  plan: Pick<ResetPlan, 'chains' | 'checkouts' | 'overCap'>
): PurgeOutcome {
  if (plan.overCap.chains > 0 || plan.overCap.checkouts > 0) return 'partial'
  const kept = [...plan.chains, ...plan.checkouts].some((row) => row.kept !== null)
  return kept ? 'tombstone' : 'hard_delete'
}

/**
 * Whether what was typed is the garage's name. Spaces at the ends and
 * doubled spaces are forgiven, as the reset's phrase forgives them; the
 * letters and their case are not. Typing the name out is the deliberate act.
 */
export function garageNameMatches(typed: string, businessName: string): boolean {
  const tidy = (value: string) => value.trim().replace(/\s+/g, ' ')
  return tidy(typed).length > 0 && tidy(typed) === tidy(businessName)
}

/**
 * The garage row as a tombstone keeps it: the fields its kept receipts print
 * (business name, address, city, pincode) and its owner, and nothing anyone
 * could use to reach the business. Coordinates stay, because a verified
 * garage must keep a pin (0022), and they are only the address's.
 */
export function tombstoneFields(now: Date) {
  return {
    purgedAt: now,
    phone: '',
    email: null,
    whatsapp: null,
    mapsUrl: null,
    logoUrl: null,
    logoStorageKey: null,
    notes: null,
  }
}

// ─── Refusals ────────────────────────────────────────────────────────────────

/** Any admin change to a garage in the Bin other than Restore and Delete forever. */
export function vendorInBin(): AppError {
  return new AppError(
    409,
    'This garage is in the Bin. Restore it before making changes.',
    'VENDOR_IN_BIN'
  )
}

/** Delete forever asked of a garage that is not in the Bin. */
export function deleteNeedsBin(): AppError {
  return new AppError(
    409,
    'Only a garage in the Bin can be deleted forever. Move it to the Bin first.',
    'VENDOR_NOT_IN_BIN'
  )
}

export function garageNameMismatch(): AppError {
  return new AppError(
    400,
    'Type the garage name exactly as shown to confirm.',
    'CONFIRM_NAME_MISMATCH'
  )
}

/** Something moved between the dialog's preview and the delete. */
export function purgePreviewStale(): AppError {
  return new AppError(
    409,
    'Something changed since this was shown: a booking was paid, refunded or moved. Nothing was deleted. Open Delete forever again to see it as it is now.',
    'PREVIEW_STALE'
  )
}

export function purgeBusy(): AppError {
  return new AppError(
    503,
    'Some of these bookings were being changed at the same moment, so nothing was deleted. Try again in a minute.',
    'RESET_BUSY'
  )
}
