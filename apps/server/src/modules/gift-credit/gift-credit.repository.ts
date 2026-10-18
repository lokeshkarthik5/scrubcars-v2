import { and, asc, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import type { PgTransaction } from 'drizzle-orm/pg-core'
import { db } from '../../db/index.js'
import {
  adminAuditLog,
  bookingNotes,
  bookings,
  giftCreditEntries,
  payments,
  users,
} from '../../db/schema.js'
import {
  adjustmentRefusal,
  balanceOf,
  expiredRemainders,
  giftExpiresAt,
  paise,
  planDraw,
  returnedCreditExpiresAt,
  rupees,
  type CreditEntry,
} from '../../lib/gift-credit.js'
import { isBookingPaymentRefundable } from '../../lib/refunds.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = PgTransaction<any, any, any>
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Conn = typeof db | Tx

/**
 * The customer's credit lock: every write to their ledger takes it, so two
 * checkouts (or a checkout and a redemption, an adjustment or the expiry
 * sweep) can never both spend the same rupee. In a booking write it comes
 * after the discount lock and before the receipt's (see the lock order in
 * bookings.repository.ts); everywhere else it is taken on its own.
 */
export async function lockCredit(tx: AnyTx, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`gift-credit:${userId}`})::bigint)`)
}

const ENTRY_COLUMNS = {
  id: giftCreditEntries.id,
  kind: giftCreditEntries.kind,
  amount: giftCreditEntries.amount,
  lotId: giftCreditEntries.lotId,
  expiresAt: giftCreditEntries.expiresAt,
  createdAt: giftCreditEntries.createdAt,
}

/** Every ledger row of one customer, oldest first: what the rules read. */
export async function listCreditEntries(conn: Conn | AnyTx, userId: string): Promise<CreditEntry[]> {
  const rows = await (conn as Conn)
    .select(ENTRY_COLUMNS)
    .from(giftCreditEntries)
    .where(eq(giftCreditEntries.userId, userId))
    .orderBy(asc(giftCreditEntries.createdAt), asc(giftCreditEntries.id))
  return rows
}

/**
 * Inside a booking write (consumeIntent), under the customer's credit lock:
 * which lots pay `amountPaise`, or null when the balance no longer covers it
 * (spent elsewhere, or expired, since the checkout was priced).
 */
export async function lockAndPlanCreditDraw(
  tx: AnyTx,
  input: { userId: string; amountPaise: number; now: Date }
): Promise<Array<{ lotId: string; paise: number }> | null> {
  await lockCredit(tx, input.userId)
  const entries = await listCreditEntries(tx, input.userId)
  return planDraw(entries, input.amountPaise, input.now)
}

/** The booking's draws, one row per lot, written with the booking. */
export async function insertCreditDraws(
  tx: AnyTx,
  input: { userId: string; bookingId: string; draws: Array<{ lotId: string; paise: number }> }
) {
  if (input.draws.length === 0) return
  await tx.insert(giftCreditEntries).values(
    input.draws.map((draw) => ({
      userId: input.userId,
      kind: 'debit' as const,
      amount: rupees(-draw.paise),
      lotId: draw.lotId,
      bookingId: input.bookingId,
    }))
  )
}

/**
 * A reward for a bypass report Detlio confirmed (0052): a new lot of kind
 * `report_reward`, lasting 12 months like a gift, written in the caller's
 * transaction under the customer's credit lock (taken here). The caller
 * (bypass-reports.repository `confirm` / `grantOwed`) holds its garage's
 * bypass lock first; nothing holds the credit lock and then asks for that
 * one, so the two never wait on each other.
 */
export async function insertReportRewardLot(
  tx: AnyTx,
  input: { userId: string; amountPaise: number; reason: string; actorName: string; now: Date }
): Promise<{ id: string }> {
  await lockCredit(tx, input.userId)
  const [entry] = await tx
    .insert(giftCreditEntries)
    .values({
      userId: input.userId,
      kind: 'report_reward',
      amount: rupees(input.amountPaise),
      expiresAt: giftExpiresAt(input.now),
      reason: input.reason.slice(0, 300),
      actorName: input.actorName.slice(0, 100),
    })
    .returning({ id: giftCreditEntries.id })
  return entry!
}

/** What returnBookingCredit did. */
export type CreditReturn =
  | { kind: 'returned'; userId: string; amount: string; expiresAt: Date; rootBookingId: string }
  | { kind: 'nothing' }

export const giftCreditRepository = {
  listEntries(userId: string) {
    return listCreditEntries(db, userId)
  },

  /** The latest ledger rows of one customer, newest first, for their screen. */
  listRecentEntries(userId: string, limit: number) {
    return db
      .select({
        ...ENTRY_COLUMNS,
        giftId: giftCreditEntries.giftId,
        bookingId: giftCreditEntries.bookingId,
        reason: giftCreditEntries.reason,
      })
      .from(giftCreditEntries)
      .where(eq(giftCreditEntries.userId, userId))
      .orderBy(desc(giftCreditEntries.createdAt), desc(giftCreditEntries.id))
      .limit(limit)
  },

  /**
   * Gives a cancelled booking's credit part back to the customer's credit,
   * once. Only when lib/refunds.ts says the booking's money is owed back
   * (cancelled by anyone, or a garage no-show; never a customer no-show or
   * a booking the customer moved, whose payment went with it), and only the
   * credit part: the Razorpay part is refunded as today.
   *
   * Under the customer's credit lock, taken on its own. The payment row's
   * conditional update (`credit_returned_at is null`) and the ledger's
   * unique index on a chain's `refund` both make a second run a no-op. A
   * payment with nothing left of its Razorpay part to refund moves to
   * 'refunded', as a full refund does.
   */
  async returnBookingCredit(bookingId: string, now: Date): Promise<CreditReturn> {
    return db.transaction(async (tx): Promise<CreditReturn> => {
      const [row] = await tx
        .select({
          id: bookings.id,
          userId: bookings.userId,
          originalBookingId: bookings.originalBookingId,
          status: bookings.status,
          noShow: bookings.noShow,
          paymentId: payments.id,
          paymentStatus: payments.status,
          creditAmount: payments.creditAmount,
          creditReturnedAt: payments.creditReturnedAt,
        })
        .from(bookings)
        .innerJoin(payments, eq(payments.bookingId, bookings.id))
        .where(eq(bookings.id, bookingId))
        .limit(1)
      if (!row || paise(row.creditAmount) <= 0 || row.creditReturnedAt) return { kind: 'nothing' }

      const [next] = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(eq(bookings.rescheduledFromId, bookingId))
        .limit(1)
      const refundable = isBookingPaymentRefundable(
        { status: row.status, noShow: row.noShow ?? null, moved: Boolean(next) },
        { status: row.paymentStatus }
      )
      if (!refundable) return { kind: 'nothing' }

      await lockCredit(tx, row.userId)

      const [returned] = await tx
        .update(payments)
        .set({
          creditReturnedAt: now,
          // Nothing of the Razorpay part left to give back: the whole payment
          // has gone back, so it reads as refunded, like a full refund.
          status: sql`case when ${payments.status} = 'paid'
                            and ${payments.amount} - coalesce(${payments.refundedAmount}, 0) <= 0
                       then 'refunded'::payment_status else ${payments.status} end`,
        })
        .where(and(eq(payments.id, row.paymentId), isNull(payments.creditReturnedAt), gt(payments.creditAmount, '0')))
        .returning({ creditAmount: payments.creditAmount })
      if (!returned) return { kind: 'nothing' }

      const rootBookingId = row.originalBookingId ?? row.id
      // The credit comes back with the latest expiry of the lots it was
      // spent from, never less than 30 days from now.
      const lots = await tx.execute<{ expires_at: Date | string }>(sql`
        select l.expires_at
          from gift_credit_entries d
          join gift_credit_entries l on l.id = d.lot_id
         where d.booking_id = ${rootBookingId}
           and d.kind = 'debit'
      `)
      const expiresAt = returnedCreditExpiresAt(
        lots.map((lot) => new Date(lot.expires_at)),
        now
      )

      const [entry] = await tx
        .insert(giftCreditEntries)
        .values({
          userId: row.userId,
          kind: 'refund',
          amount: returned.creditAmount,
          expiresAt,
          bookingId: rootBookingId,
        })
        .onConflictDoNothing()
        .returning({ id: giftCreditEntries.id })
      // The chain's credit already came back (a row from an older run): the
      // payment update above stands, and nothing more is added.
      if (!entry) return { kind: 'nothing' }

      await tx.insert(bookingNotes).values({
        bookingId,
        author: 'Detlio (automatic)',
        body: `Returned ₹${Number(returned.creditAmount).toLocaleString('en-IN')} to the customer's Detlio credit (the part of this booking paid with credit). Any card or UPI part is refunded as usual.`,
      })

      return { kind: 'returned', userId: row.userId, amount: returned.creditAmount, expiresAt, rootBookingId }
    })
  },

  /**
   * Bookings whose credit should have come back and hasn't: cancelled (not a
   * customer no-show, not moved), credit unreturned. The cron's safety net
   * behind the return queued after each cancel.
   */
  async listCreditToReturn(limit: number): Promise<string[]> {
    const rows = await db
      .select({ bookingId: payments.bookingId })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .where(
        and(
          gt(payments.creditAmount, '0'),
          isNull(payments.creditReturnedAt),
          inArray(payments.status, ['paid', 'refunded']),
          eq(bookings.status, 'cancelled'),
          sql`${bookings.noShow} is distinct from 'customer'`,
          sql`not exists (select 1 from bookings n where n.rescheduled_from_id = ${bookings.id})`
        )
      )
      .orderBy(asc(bookings.cancelledAt))
      .limit(limit)
    return rows.map((row) => row.bookingId)
  },

  /** Customers with a lot that ran out with something left, for the expiry sweep. */
  async listUsersWithExpiredCredit(now: Date, limit: number): Promise<string[]> {
    const rows = await db.execute<{ user_id: string }>(sql`
      select distinct l.user_id
        from gift_credit_entries l
       where l.lot_id is null
         and l.expires_at <= ${now.toISOString()}::timestamptz
         and l.amount + coalesce((select sum(d.amount) from gift_credit_entries d where d.lot_id = l.id), 0) > 0
       limit ${limit}
    `)
    return rows.map((row) => row.user_id)
  },

  /** Writes off what each of a customer's expired lots had left, under their lock. */
  async writeExpiries(userId: string, now: Date): Promise<number> {
    return db.transaction(async (tx) => {
      await lockCredit(tx, userId)
      const remainders = expiredRemainders(await listCreditEntries(tx, userId), now)
      if (remainders.length === 0) return 0
      await tx.insert(giftCreditEntries).values(
        remainders.map((lot) => ({
          userId,
          kind: 'expiry' as const,
          amount: rupees(-lot.paise),
          lotId: lot.lotId,
        }))
      )
      return remainders.reduce((sum, lot) => sum + lot.paise, 0)
    })
  },

  /**
   * A team adjustment (admin), under the customer's credit lock, with its
   * audit row in the same transaction. A positive one is a new lot lasting
   * 12 months; a negative one is drawn oldest expiry first and can't take
   * more than the balance.
   */
  async adjust(input: {
    userId: string
    amountPaise: number
    reason: string
    actorName: string
    actorSub: string
    now: Date
  }): Promise<{ kind: 'ok'; balancePaise: number } | { kind: 'refused'; refusal: NonNullable<ReturnType<typeof adjustmentRefusal>> }> {
    return db.transaction(async (tx) => {
      await lockCredit(tx, input.userId)
      const entries = await listCreditEntries(tx, input.userId)
      const before = balanceOf(entries, input.now)
      const refusal = adjustmentRefusal({ amountPaise: input.amountPaise, balancePaise: before })
      if (refusal) return { kind: 'refused' as const, refusal }

      const common = { userId: input.userId, kind: 'adjustment' as const, reason: input.reason, actorName: input.actorName }
      if (input.amountPaise > 0) {
        await tx.insert(giftCreditEntries).values({
          ...common,
          amount: rupees(input.amountPaise),
          expiresAt: giftExpiresAt(input.now),
        })
      } else {
        const draws = planDraw(entries, -input.amountPaise, input.now)
        if (!draws) return { kind: 'refused' as const, refusal: 'over_balance' as const }
        await tx.insert(giftCreditEntries).values(
          draws.map((draw) => ({ ...common, amount: rupees(-draw.paise), lotId: draw.lotId }))
        )
      }

      const after = before + input.amountPaise
      await tx.insert(adminAuditLog).values({
        action: 'gift_credit_adjusted',
        actorSub: input.actorSub,
        actorName: input.actorName,
        summary: { userId: input.userId, amount: rupees(input.amountPaise), balanceAfter: rupees(after) },
        detail: { reason: input.reason, balanceBefore: rupees(before) },
      })
      return { kind: 'ok' as const, balancePaise: after }
    })
  },

  /**
   * Every customer's credit still spendable now, and how much of it runs out
   * within `soonDays`: the lots not yet expired, less their draws.
   */
  async outstanding(now: Date, soonBy: Date): Promise<{ balance: string; expiringSoon: string; customers: number }> {
    const [row] = await db.execute<{ balance: string | null; expiring: string | null; customers: string | null }>(sql`
      with lots as (
        select l.user_id, l.expires_at,
               l.amount + coalesce((select sum(d.amount) from gift_credit_entries d where d.lot_id = l.id), 0) as remaining
          from gift_credit_entries l
         where l.lot_id is null
           and l.expires_at > ${now.toISOString()}::timestamptz
      )
      select sum(remaining)::text as balance,
             sum(remaining) filter (where expires_at <= ${soonBy.toISOString()}::timestamptz)::text as expiring,
             count(distinct user_id) filter (where remaining > 0)::text as customers
        from lots
       where remaining > 0
    `)
    return {
      balance: rupees(paise(row?.balance)),
      expiringSoon: rupees(paise(row?.expiring)),
      customers: Number(row?.customers ?? 0),
    }
  },

  /** Credit spent on bookings, and given back, in all (for the admin page). */
  async totalsByKind(): Promise<Record<string, string>> {
    const rows = await db
      .select({ kind: giftCreditEntries.kind, total: sql<string | null>`sum(${giftCreditEntries.amount})::text` })
      .from(giftCreditEntries)
      .groupBy(giftCreditEntries.kind)
    return Object.fromEntries(rows.map((row) => [row.kind, rupees(paise(row.total))]))
  },

  /** The customers holding the most credit now, for the admin page. */
  async topBalances(now: Date, limit: number) {
    const rows = await db.execute<{ user_id: string; name: string; phone: string; balance: string; next_expiry: Date | string | null }>(sql`
      with lots as (
        select l.user_id, l.expires_at,
               l.amount + coalesce((select sum(d.amount) from gift_credit_entries d where d.lot_id = l.id), 0) as remaining
          from gift_credit_entries l
         where l.lot_id is null
           and l.expires_at > ${now.toISOString()}::timestamptz
      )
      select lots.user_id, u.name, u.phone, sum(remaining)::text as balance, min(expires_at) as next_expiry
        from lots
        join users u on u.id = lots.user_id
       where remaining > 0
       group by lots.user_id, u.name, u.phone
       order by sum(remaining) desc
       limit ${limit}
    `)
    return rows.map((row) => ({
      userId: row.user_id,
      name: row.name,
      phone: row.phone,
      balance: rupees(paise(row.balance)),
      nextExpiry: row.next_expiry ? new Date(row.next_expiry) : null,
    }))
  },

  findCustomerByPhone(phone: string) {
    return db.query.users.findFirst({
      where: eq(users.phone, phone),
      columns: { id: true, name: true, phone: true },
    })
  },

  findCustomerById(userId: string) {
    return db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true, name: true, phone: true },
    })
  },

  /** Whether the account has any gift or credit record (DELETE /users/me). */
  async hasCreditEntries(userId: string): Promise<boolean> {
    const [row] = await db
      .select({ one: sql`1` })
      .from(giftCreditEntries)
      .where(eq(giftCreditEntries.userId, userId))
      .limit(1)
    return Boolean(row)
  },
}
