import { and, asc, count, desc, eq, gte, inArray, isNotNull, ne, or, sql } from 'drizzle-orm'
import type { PgTransaction } from 'drizzle-orm/pg-core'
import { db } from '../../db/index.js'
import { adminAuditLog, bookings, bypassReports, users, vendors } from '../../db/schema.js'
import type { BypassStatus, RewardDecision } from '../../lib/bypass-reports.js'
import type { DropOffChain } from '../../lib/drop-off.js'
import { insertReportRewardLot } from '../gift-credit/gift-credit.repository.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = PgTransaction<any, any, any>
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Conn = typeof db | Tx

export type BypassReportRecord = typeof bypassReports.$inferSelect
export type BypassReportInsert = typeof bypassReports.$inferInsert

/**
 * The customer's lock on their reports: the per-booking and yearly limits
 * are counted under it, so two taps at once cannot both take the last
 * place. Taken on its own, never alongside the booking-write locks.
 */
const customerLockKey = (userId: string) => `bypass-reports:${userId}`

/**
 * A garage's lock on its reports' outcomes: confirmations are counted under
 * it, so the strike count each one reads (and the "reached 2" alert) and the
 * once-per-customer-per-garage reward are decided one at a time. Taken on
 * its own, never alongside the booking-write locks; a confirm that grants
 * the reward takes the customer's credit lock (`gift-credit:<userId>`) after
 * it, and nothing takes them the other way round.
 */
const garageLockKey = (vendorId: string) => `bypass-reports:garage:${vendorId}`

async function lock(tx: AnyTx | Tx, key: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key})::bigint)`)
}

/**
 * A garage's strikes, counted in SQL: its confirmed reports confirmed since
 * `since` (and not after `until`), a report on a Test-marked booking left
 * out (one whose booking is gone counts, like complaints'). The one SQL
 * definition: admin's garage list, the garage page, the reports list and
 * Detlio Certified's standard (certification.repository) all read it.
 */
export async function strikeCountsByGarage(
  conn: Conn | AnyTx,
  input: { vendorIds: string[] | null; since: Date; until?: Date; excludeReportId?: string }
): Promise<Array<{ vendorId: string; count: number }>> {
  if (input.vendorIds !== null && input.vendorIds.length === 0) return []
  const vendorFilter =
    input.vendorIds === null
      ? sql``
      : sql`and r.vendor_id in (${sql.join(input.vendorIds.map((id) => sql`${id}::uuid`), sql`, `)})`
  const rows = await (conn as Conn).execute<{ vendor_id: string; count: number | string }>(sql`
    select r.vendor_id, count(*)::int as count
      from bypass_reports r
      left join bookings b on b.id = r.booking_id
     where r.status = 'confirmed'
       and r.vendor_id is not null
       ${vendorFilter}
       and r.confirmed_at >= ${input.since.toISOString()}::timestamptz
       ${input.until ? sql`and r.confirmed_at <= ${input.until.toISOString()}::timestamptz` : sql``}
       ${input.excludeReportId ? sql`and r.id <> ${input.excludeReportId}::uuid` : sql``}
       and (b.id is null or b.marked_test_at is null)
     group by r.vendor_id
  `)
  return Array.from(rows).map((row) => ({ vendorId: row.vendor_id, count: Number(row.count) }))
}

/** A booking's chain, as the report reads it: the customer's own only. */
export interface ReportChain {
  rootBookingId: string
  /** The chain's latest row: what the window rule judges, and what the report names. */
  latest: {
    id: string
    status: string
    vendorId: string
    garageName: string
    acceptedAt: Date | null
    completedAt: Date | null
    deliveredAt: Date | null
    cancelledAt: Date | null
    scheduledAt: Date
  }
}

/** An admin list row: the report, its customer and booking as they are now. */
export interface AdminReportRow {
  report: BypassReportRecord
  customerName: string | null
  customerPhone: string | null
  bookingStatus: string | null
  bookingScheduledAt: Date | null
  bookingMarkedTest: boolean
}

const adminColumns = {
  report: bypassReports,
  customerName: users.name,
  customerPhone: users.phone,
  bookingStatus: bookings.status,
  bookingScheduledAt: bookings.scheduledAt,
  bookingMarkedTest: sql<boolean>`${bookings.markedTestAt} is not null`,
}

export type ConfirmOutcome =
  | { kind: 'not_found' }
  | { kind: 'moved_on' }
  | {
      kind: 'confirmed'
      report: BypassReportRecord
      strikesBefore: number
      strikesAfter: number
      reward: RewardDecision
    }

export const bypassReportsRepository = {
  /**
   * The booking a report is about: only one of this customer's own (anyone
   * else's reads as no booking, so the answer never says whether it exists),
   * with its reschedule chain's latest row.
   */
  async findOwnChain(userId: string, bookingId: string): Promise<ReportChain | null> {
    const [own] = await db
      .select({ id: bookings.id, originalBookingId: bookings.originalBookingId })
      .from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.userId, userId)))
      .limit(1)
    if (!own) return null
    const rootBookingId = own.originalBookingId ?? own.id
    const [latest] = await db
      .select({
        id: bookings.id,
        status: bookings.status,
        vendorId: bookings.vendorId,
        garageName: vendors.businessName,
        acceptedAt: bookings.acceptedAt,
        completedAt: bookings.completedAt,
        deliveredAt: bookings.deliveredAt,
        cancelledAt: bookings.cancelledAt,
        scheduledAt: bookings.scheduledAt,
      })
      .from(bookings)
      .innerJoin(vendors, eq(vendors.id, bookings.vendorId))
      .where(
        and(
          eq(bookings.userId, userId),
          or(eq(bookings.id, rootBookingId), eq(bookings.originalBookingId, rootBookingId)),
          sql`not exists (select 1 from bookings moved_to where moved_to.rescheduled_from_id = ${bookings.id})`
        )
      )
      .limit(1)
    if (!latest) return null
    return { rootBookingId, latest }
  },

  /** The customer's report on this chain, if they made one. */
  async findOwnByRoot(userId: string, rootBookingId: string) {
    const [row] = await db
      .select()
      .from(bypassReports)
      .where(and(eq(bypassReports.userId, userId), eq(bypassReports.rootBookingId, rootBookingId)))
      .limit(1)
    return row ?? null
  },

  /** How many reports the customer made since `since` (the yearly cap). */
  async countSince(userId: string, since: Date): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(bypassReports)
      .where(and(eq(bypassReports.userId, userId), gte(bypassReports.createdAt, since)))
    return Number(row?.value ?? 0)
  },

  /**
   * Inserts a report if the customer may make it, under their lock: whether
   * this chain was reported, and their reports since `since`, are read
   * there, and `decide` (lib/bypass-reports.ts `submitRefusal`) says. A
   * refusal is passed back and nothing is written. The chain's unique index
   * stands behind it.
   */
  insertUnderLimits<R extends string>(input: {
    userId: string
    since: Date
    values: Omit<BypassReportInsert, 'userId'> & { rootBookingId: string }
    decide: (counts: { alreadyReported: boolean; inLastYear: number }) => R | null
  }): Promise<{ created: BypassReportRecord } | { created: null; refusal: R | 'already_reported' }> {
    return db.transaction(async (tx) => {
      await lock(tx, customerLockKey(input.userId))
      const [reported] = await tx
        .select({ id: bypassReports.id })
        .from(bypassReports)
        .where(eq(bypassReports.rootBookingId, input.values.rootBookingId))
        .limit(1)
      const [counted] = await tx
        .select({ value: count() })
        .from(bypassReports)
        .where(and(eq(bypassReports.userId, input.userId), gte(bypassReports.createdAt, input.since)))
      const refusal = input.decide({ alreadyReported: Boolean(reported), inLastYear: Number(counted?.value ?? 0) })
      if (refusal) return { created: null, refusal }
      const [created] = await tx
        .insert(bypassReports)
        .values({ ...input.values, userId: input.userId })
        .onConflictDoNothing()
        .returning()
      if (!created) return { created: null, refusal: 'already_reported' as const }
      return { created }
    })
  },

  /** The customer's own reports, newest first. */
  listForCustomer(userId: string, limit: number) {
    return db
      .select()
      .from(bypassReports)
      .where(eq(bypassReports.userId, userId))
      .orderBy(desc(bypassReports.createdAt))
      .limit(limit)
  },

  /**
   * Rewards granted to the customer since `since`, for Updates: the time and
   * the amount's report only, never the team's names.
   */
  listRewardsGrantedSince(userId: string, since: Date) {
    return db
      .select({ id: bypassReports.id, grantedAt: bypassReports.rewardGrantedAt, garageName: bypassReports.garageName })
      .from(bypassReports)
      .where(
        and(
          eq(bypassReports.userId, userId),
          eq(bypassReports.rewardStatus, 'granted'),
          gte(bypassReports.rewardGrantedAt, since)
        )
      )
      .orderBy(desc(bypassReports.rewardGrantedAt))
      .limit(20)
  },

  // ─── Admin ─────────────────────────────────────────────────────────────────

  /** One status of the admin list: new oldest first (the queue), the others newest first. */
  async listForAdmin(status: BypassStatus, limit: number): Promise<AdminReportRow[]> {
    const rows = await db
      .select(adminColumns)
      .from(bypassReports)
      .leftJoin(users, eq(users.id, bypassReports.userId))
      .leftJoin(bookings, eq(bookings.id, bypassReports.bookingId))
      .where(eq(bypassReports.status, status))
      .orderBy(status === 'new' ? asc(bypassReports.createdAt) : desc(bypassReports.updatedAt), asc(bypassReports.id))
      .limit(limit)
    return rows.map((row) => ({ ...row, bookingMarkedTest: Boolean(row.bookingMarkedTest) }))
  },

  async countByStatus(): Promise<Record<BypassStatus, number>> {
    const [row] = await db
      .select({
        new: sql<number>`count(*) filter (where ${bypassReports.status} = 'new')`,
        confirmed: sql<number>`count(*) filter (where ${bypassReports.status} = 'confirmed')`,
        dismissed: sql<number>`count(*) filter (where ${bypassReports.status} = 'dismissed')`,
      })
      .from(bypassReports)
    return {
      new: Number(row?.new ?? 0),
      confirmed: Number(row?.confirmed ?? 0),
      dismissed: Number(row?.dismissed ?? 0),
    }
  },

  async findForAdmin(id: string): Promise<AdminReportRow | null> {
    const [row] = await db
      .select(adminColumns)
      .from(bypassReports)
      .leftJoin(users, eq(users.id, bypassReports.userId))
      .leftJoin(bookings, eq(bookings.id, bypassReports.bookingId))
      .where(eq(bypassReports.id, id))
      .limit(1)
    return row ? { ...row, bookingMarkedTest: Boolean(row.bookingMarkedTest) } : null
  },

  strikeCounts(input: { vendorIds: string[] | null; since: Date }) {
    return strikeCountsByGarage(db, input)
  },

  /** A garage's reports by status, all time, for its admin page. */
  async countForGarage(vendorId: string): Promise<Record<BypassStatus, number>> {
    const [row] = await db
      .select({
        new: sql<number>`count(*) filter (where ${bypassReports.status} = 'new')`,
        confirmed: sql<number>`count(*) filter (where ${bypassReports.status} = 'confirmed')`,
        dismissed: sql<number>`count(*) filter (where ${bypassReports.status} = 'dismissed')`,
      })
      .from(bypassReports)
      .where(eq(bypassReports.vendorId, vendorId))
    return {
      new: Number(row?.new ?? 0),
      confirmed: Number(row?.confirmed ?? 0),
      dismissed: Number(row?.dismissed ?? 0),
    }
  },

  async garageExists(vendorId: string): Promise<boolean> {
    const [row] = await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.id, vendorId)).limit(1)
    return Boolean(row)
  },

  /**
   * Confirms a new report, in one transaction under its garage's lock: the
   * conditional move (only from new, so two presses confirm once), the
   * garage's strikes before and after, the reward decided by `decide`
   * (lib/bypass-reports.ts `rewardDecision`, told whether this customer was
   * already rewarded or owed for this garage) and, when granted, the ledger
   * lot under the customer's credit lock, and the audit row. A report whose
   * garage was deleted forever has no garage lock (and no strikes).
   */
  confirm(input: {
    id: string
    actorName: string
    actorSub: string
    now: Date
    strikesSince: Date
    rewardAmountPaise: number
    rewardReason: (bookingRef: string) => string
    decide: (facts: { hasAccount: boolean; hasGarage: boolean; alreadyRewarded: boolean }) => RewardDecision
  }): Promise<ConfirmOutcome> {
    return db.transaction(async (tx): Promise<ConfirmOutcome> => {
      const [found] = await tx
        .select({ vendorId: bypassReports.vendorId })
        .from(bypassReports)
        .where(eq(bypassReports.id, input.id))
        .limit(1)
      if (!found) return { kind: 'not_found' }
      if (found.vendorId) await lock(tx, garageLockKey(found.vendorId))

      const [moved] = await tx
        .update(bypassReports)
        .set({ status: 'confirmed', confirmedAt: input.now, confirmedBy: input.actorName, updatedAt: input.now })
        .where(and(eq(bypassReports.id, input.id), eq(bypassReports.status, 'new')))
        .returning()
      if (!moved) return { kind: 'moved_on' }

      let strikesBefore = 0
      let strikesAfter = 0
      if (moved.vendorId) {
        const window = { vendorIds: [moved.vendorId], since: input.strikesSince, until: input.now }
        strikesAfter = (await strikeCountsByGarage(tx, window))[0]?.count ?? 0
        strikesBefore = (await strikeCountsByGarage(tx, { ...window, excludeReportId: moved.id }))[0]?.count ?? 0
      }

      let alreadyRewarded = false
      if (moved.userId && moved.vendorId) {
        const [other] = await tx
          .select({ id: bypassReports.id })
          .from(bypassReports)
          .where(
            and(
              eq(bypassReports.userId, moved.userId),
              eq(bypassReports.vendorId, moved.vendorId),
              ne(bypassReports.id, moved.id),
              inArray(bypassReports.rewardStatus, ['owed', 'granted'])
            )
          )
          .limit(1)
        alreadyRewarded = Boolean(other)
      }
      const reward = input.decide({
        hasAccount: moved.userId !== null,
        hasGarage: moved.vendorId !== null,
        alreadyRewarded,
      })

      let report = moved
      if (reward.kind === 'grant' && moved.userId) {
        const entry = await insertReportRewardLot(tx, {
          userId: moved.userId,
          amountPaise: input.rewardAmountPaise,
          reason: input.rewardReason(moved.bookingRef),
          actorName: input.actorName,
          now: input.now,
        })
        ;[report] = await tx
          .update(bypassReports)
          .set({ rewardStatus: 'granted', rewardEntryId: entry.id, rewardGrantedAt: input.now, updatedAt: input.now })
          .where(eq(bypassReports.id, moved.id))
          .returning()
      } else if (reward.kind === 'owe') {
        ;[report] = await tx
          .update(bypassReports)
          .set({ rewardStatus: 'owed', updatedAt: input.now })
          .where(eq(bypassReports.id, moved.id))
          .returning()
      }

      await tx.insert(adminAuditLog).values({
        action: 'bypass_report_confirmed',
        actorSub: input.actorSub,
        actorName: input.actorName,
        summary: {
          reportId: moved.id,
          vendorId: moved.vendorId,
          bookingRef: moved.bookingRef,
          strikes: strikesAfter,
          reward: reward.kind,
        },
        detail: {
          kind: moved.kind,
          rewardWhyNot: reward.kind === 'none' ? reward.why : null,
          rewardAmount: reward.kind === 'grant' || reward.kind === 'owe' ? input.rewardAmountPaise / 100 : 0,
        },
      })

      return { kind: 'confirmed', report: report!, strikesBefore, strikesAfter, reward }
    })
  },

  /** Dismisses a new report, with the reason and the typed name, and its audit row. */
  dismiss(input: { id: string; actorName: string; actorSub: string; reason: string; now: Date }) {
    return db.transaction(async (tx) => {
      const [moved] = await tx
        .update(bypassReports)
        .set({
          status: 'dismissed',
          dismissedAt: input.now,
          dismissedBy: input.actorName,
          dismissedReason: input.reason,
          updatedAt: input.now,
        })
        .where(and(eq(bypassReports.id, input.id), eq(bypassReports.status, 'new')))
        .returning()
      if (!moved) return null
      await tx.insert(adminAuditLog).values({
        action: 'bypass_report_dismissed',
        actorSub: input.actorSub,
        actorName: input.actorName,
        summary: { reportId: moved.id, vendorId: moved.vendorId, bookingRef: moved.bookingRef },
        detail: { reason: input.reason },
      })
      return moved
    })
  },

  async exists(id: string): Promise<boolean> {
    const [row] = await db.select({ id: bypassReports.id }).from(bypassReports).where(eq(bypassReports.id, id)).limit(1)
    return Boolean(row)
  },

  /** Owed rewards whose customer still has an account, oldest first (the cron). */
  async listOwed(limit: number): Promise<string[]> {
    const rows = await db
      .select({ id: bypassReports.id })
      .from(bypassReports)
      .where(and(eq(bypassReports.rewardStatus, 'owed'), isNotNull(bypassReports.userId)))
      .orderBy(asc(bypassReports.confirmedAt))
      .limit(limit)
    return rows.map((row) => row.id)
  },

  /**
   * Grants one owed reward, once: under the garage's lock, the report row
   * conditional on still being owed, then the lot under the customer's
   * credit lock. Null when there was nothing to grant (granted meanwhile, or
   * the account is gone).
   */
  grantOwed(input: { id: string; now: Date; rewardAmountPaise: number; rewardReason: (bookingRef: string) => string }) {
    return db.transaction(async (tx) => {
      const [found] = await tx
        .select({ vendorId: bypassReports.vendorId })
        .from(bypassReports)
        .where(eq(bypassReports.id, input.id))
        .limit(1)
      if (!found) return null
      if (found.vendorId) await lock(tx, garageLockKey(found.vendorId))
      const [owed] = await tx
        .select()
        .from(bypassReports)
        .where(and(eq(bypassReports.id, input.id), eq(bypassReports.rewardStatus, 'owed'), isNotNull(bypassReports.userId)))
        .for('update')
        .limit(1)
      if (!owed || !owed.userId) return null
      const entry = await insertReportRewardLot(tx, {
        userId: owed.userId,
        amountPaise: input.rewardAmountPaise,
        reason: input.rewardReason(owed.bookingRef),
        actorName: owed.confirmedBy ?? 'Detlio',
        now: input.now,
      })
      const [granted] = await tx
        .update(bypassReports)
        .set({ rewardStatus: 'granted', rewardEntryId: entry.id, rewardGrantedAt: input.now, updatedAt: input.now })
        .where(eq(bypassReports.id, owed.id))
        .returning()
      return granted ?? null
    })
  },

  // ─── Customer drop-off ─────────────────────────────────────────────────────

  /**
   * The booking chains drop-off reads (lib/drop-off.ts), in a read-only
   * transaction with a 10-second statement timeout like Statistics: every
   * chain, made or done since `historyFrom`, whose money landed, of the
   * customers who completed `minCompleted`+ bookings at one garage since
   * `regularFrom`. Chains as Statistics reads them (the latest row says how
   * it ended, the first row when it was made), Test-marked ones left out.
   * Bounded by `limit` rows: pilot scale reads them all.
   */
  dropOffChains(input: { regularFrom: Date; historyFrom: Date; minCompleted: number; limit: number }): Promise<DropOffChain[]> {
    return db.transaction(
      async (tx) => {
        await tx.execute(sql`set local statement_timeout = '10s'`)
        const rows = await tx.execute<{
          user_id: string
          vendor_id: string
          booking_id: string
          status: string
          booked_at: Date | string
          service_at: Date | string
        }>(sql`
          with latest as (
            select b.*, coalesce(b.original_booking_id, b.id) as root_id
              from bookings b
             where not exists (select 1 from bookings moved_to where moved_to.rescheduled_from_id = b.id)
               and b.marked_test_at is null
          ),
          chains as (
            select l.id, l.user_id, l.vendor_id, l.status,
                   coalesce(r.created_at, l.created_at) as booked_at,
                   case when l.status = 'completed'
                        then coalesce(l.completed_at, l.delivered_at, l.scheduled_at)
                        else l.scheduled_at end as service_at
              from latest l
              left join bookings r on r.id = l.original_booking_id
              join payments p on p.booking_id = l.id
             where p.status in ('paid', 'collected', 'refunded')
          ),
          regulars as (
            select c.user_id
              from chains c
             where c.status = 'completed'
               and c.service_at >= ${input.regularFrom.toISOString()}::timestamptz
             group by c.user_id, c.vendor_id
            having count(*) >= ${input.minCompleted}
          )
          select c.user_id, c.vendor_id, c.id as booking_id, c.status, c.booked_at, c.service_at
            from chains c
           where c.user_id in (select user_id from regulars)
             and (c.service_at >= ${input.historyFrom.toISOString()}::timestamptz
                  or c.booked_at >= ${input.historyFrom.toISOString()}::timestamptz)
           order by c.user_id, c.service_at
           limit ${input.limit}
        `)
        return Array.from(rows).map((row) => ({
          userId: row.user_id,
          vendorId: row.vendor_id,
          bookingId: row.booking_id,
          status: row.status,
          bookedAt: new Date(row.booked_at),
          serviceAt: new Date(row.service_at),
        }))
      },
      { accessMode: 'read only' }
    )
  },

  /** Names for the drop-off rows: garages (not in the Bin or deleted) and customers. */
  async garageNames(vendorIds: string[]) {
    if (vendorIds.length === 0) return []
    return db
      .select({ id: vendors.id, name: vendors.businessName, deletedAt: vendors.deletedAt })
      .from(vendors)
      .where(inArray(vendors.id, vendorIds))
  },

  async customerNames(userIds: string[]) {
    if (userIds.length === 0) return []
    return db.select({ id: users.id, name: users.name, phone: users.phone }).from(users).where(inArray(users.id, userIds))
  },
}
