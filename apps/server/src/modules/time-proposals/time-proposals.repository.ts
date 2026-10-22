import { and, asc, eq, lte, ne, or, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { bookingTimeProposals, bookings, payments } from '../../db/schema.js'

export type ProposalRow = typeof bookingTimeProposals.$inferSelect

const UNIQUE_VIOLATION = '23505'

function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string })?.code ??
    (error as { cause?: { code?: string } })?.cause?.code
  return code === UNIQUE_VIOLATION
}

/** What insertProposal did. */
export type InsertProposalResult =
  | { kind: 'made'; proposal: ProposalRow }
  /** The booking is no longer pending and paid (accepted, cancelled, moved). */
  | { kind: 'state_changed' }
  /** Another open suggestion got there first; the unique index held. */
  | { kind: 'already_open' }
  /**
   * The garage's time to answer ran out (0042, AUTO_CANCEL_UNANSWERED on):
   * the booking is being cancelled and refunded, so it can't be answered
   * with other times any more.
   */
  | { kind: 'too_late' }

export const timeProposalsRepository = {
  /** The booking's open suggestion, if any. */
  findOpen(bookingId: string) {
    return db.query.bookingTimeProposals.findFirst({
      where: and(eq(bookingTimeProposals.bookingId, bookingId), eq(bookingTimeProposals.status, 'open')),
    })
  },

  /**
   * Writes a suggestion, only while the booking is still pending and paid:
   * the booking's own row is locked first (the lock order), so a garage
   * accept, a customer cancel or a move landing at the same moment either
   * goes before (and this finds the booking changed) or waits for it.
   */
  insertProposal(values: {
    bookingId: string
    slots: string[]
    note: string | null
    expiresAt: Date
    createdBy: string
  }, options: {
    /**
     * Set while AUTO_CANCEL_UNANSWERED is on (0042): the moment of asking.
     * A booking whose deadline to answer is at or before it is refused, in
     * the same transaction as the write, so a suggestion can't slip in after
     * the deadline whatever the cron has done.
     */
    respondByAfter?: Date
  } = {}): Promise<InsertProposalResult> {
    return db
      .transaction(async (tx): Promise<InsertProposalResult> => {
        const [booking] = await tx
          .select({ status: bookings.status, respondBy: bookings.respondBy })
          .from(bookings)
          .where(eq(bookings.id, values.bookingId))
          .for('update')
        if (!booking || booking.status !== 'pending') return { kind: 'state_changed' }
        if (options.respondByAfter && booking.respondBy && booking.respondBy <= options.respondByAfter) {
          return { kind: 'too_late' }
        }

        const [payment] = await tx
          .select({ status: payments.status })
          .from(payments)
          .where(eq(payments.bookingId, values.bookingId))
          .limit(1)
        if (!payment || (payment.status !== 'paid' && payment.status !== 'collected')) {
          return { kind: 'state_changed' }
        }

        const [proposal] = await tx.insert(bookingTimeProposals).values(values).returning()
        return { kind: 'made', proposal }
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) return { kind: 'already_open' as const }
        throw error
      })
  },

  /**
   * Open suggestions the cron has something to do with: run out, or left
   * behind by a booking that changed some other way. Oldest first, at most
   * `limit` (a bounded batch per run).
   */
  listForSweep(now: Date, limit: number) {
    return db
      .select({
        id: bookingTimeProposals.id,
        bookingId: bookingTimeProposals.bookingId,
        status: bookingTimeProposals.status,
        expiresAt: bookingTimeProposals.expiresAt,
        bookingStatus: bookings.status,
      })
      .from(bookingTimeProposals)
      .innerJoin(bookings, eq(bookings.id, bookingTimeProposals.bookingId))
      .where(
        and(
          eq(bookingTimeProposals.status, 'open'),
          or(
            lte(bookingTimeProposals.expiresAt, sql`${now.toISOString()}::timestamptz`),
            ne(bookings.status, 'pending')
          )
        )
      )
      .orderBy(asc(bookingTimeProposals.expiresAt))
      .limit(limit)
  },

  /** Closes a suggestion its booking left behind. Empty when it was no longer open. */
  close(proposalId: string, at: Date) {
    return db
      .update(bookingTimeProposals)
      .set({ status: 'closed', resolvedAt: at })
      .where(and(eq(bookingTimeProposals.id, proposalId), eq(bookingTimeProposals.status, 'open')))
      .returning({ id: bookingTimeProposals.id })
  },
}
