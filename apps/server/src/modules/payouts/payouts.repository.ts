import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  vendorPayoutAccounts,
  vendorPayoutItems,
  vendorPayouts,
  vendors,
  type PayoutItemKind,
  type PayoutMethod,
} from '../../db/schema.js'
import type { ServiceCategory } from '../../lib/categories.js'
import type { GarageQueueChain } from '../../lib/commission.js'
import { statsReads } from '../stats/stats.repository.js'

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** A Postgres timestamp as postgres-js hands it back from raw SQL: a Date, or its text. */
const toDate = (value: Date | string | null): Date | null =>
  value === null ? null : value instanceof Date ? value : new Date(value)

/**
 * The reschedule chains that can be on a statement, each once, by its latest
 * row (the one nothing was moved from): a finished job, a customer no-show,
 * or anything a payout has paid on before (which may now be owed back).
 * `root_id` is the chain's first booking, as payouts key it.
 */
function earningCte(vendorId?: string): SQL {
  return sql`
    latest as (
      select b.*, coalesce(b.original_booking_id, b.id) as root_id
        from bookings b
       where not exists (select 1 from bookings moved_to where moved_to.rescheduled_from_id = b.id)
         -- A free redo (Detlio Guarantee, 0051) earns nothing and is never
         -- paid on: it is not on any statement.
         and not b.guarantee_redo
         ${vendorId ? sql`and b.vendor_id = ${vendorId}` : sql``}
    ),
    earning as (
      select l.*
        from latest l
       where l.status = 'completed'
          or (l.status = 'cancelled' and l.no_show = 'customer')
          or exists (select 1 from vendor_payout_items i where i.booking_id = l.root_id)
    )`
}

/** A chain on a statement, before its items and refunds are attached. */
export interface EarningChainRow {
  rootId: string
  vendorId: string
  status: string
  noShow: 'customer' | 'garage' | null
  paymentMethod: 'online' | 'cash'
  paymentStatus: string | null
  paymentRefunded: string | null
  amount: string
  subtotalAmount: string
  /** An accepted request's travel fee (0062), inside the subtotal. */
  travelFee: string
  discountFundedBy: 'platform' | 'vendor' | null
  billsPaid: string | null
  lastBillPaidAt: Date | null
  scheduledAt: Date
  completedAt: Date | null
  cancelledAt: Date | null
  noShowMarkedAt: Date | null
  markedTest: boolean
  /** Refunded instead of redone (0051): earns nothing. */
  guaranteeRefund: boolean
  customerName: string | null
  bookingType: string
}

export interface EarningItemRow {
  rootId: string
  name: string
  category: ServiceCategory
  pricingType: string
  amount: string
  sortOrder: number
}

export interface EarningRefundRow {
  rootId: string
  amount: string
  gatewayStatus: 'pending' | 'processed' | 'failed' | null
}

export interface SettledRow {
  rootId: string
  payoutId: string
  amount: string
  reference: string
  paidAt: Date
}

export type PayoutRecord = typeof vendorPayouts.$inferSelect
export type PayoutItemRecord = typeof vendorPayoutItems.$inferSelect
export type PayoutAccountRecord = typeof vendorPayoutAccounts.$inferSelect

export interface GarageRow {
  id: string
  businessName: string
  deletedAt: Date | null
  purgedAt: Date | null
}

/** Reads, through the given connection: a read-only transaction, or the one recording a payout. */
export function payoutsReads(conn: Tx) {
  return {
    /** Every chain that can be on a statement, for one garage or all. */
    async earningChains(vendorId?: string): Promise<EarningChainRow[]> {
      const rows = await conn.execute<{
        root_id: string
        vendor_id: string
        status: string
        no_show: 'customer' | 'garage' | null
        payment_method: 'online' | 'cash'
        payment_status: string | null
        payment_refunded: string | null
        amount: string
        subtotal_amount: string
        travel_fee: string
        discount_funded_by: 'platform' | 'vendor' | null
        bills_paid: string | null
        last_bill_paid_at: Date | string | null
        scheduled_at: Date | string
        completed_at: Date | string | null
        cancelled_at: Date | string | null
        no_show_marked_at: Date | string | null
        marked_test: boolean
        guarantee_refund: boolean
        customer_name: string | null
        booking_type: string
      }>(sql`
        with ${earningCte(vendorId)}
        select e.root_id,
               e.vendor_id,
               e.status,
               e.no_show,
               e.payment_method,
               p.status as payment_status,
               p.refunded_amount::text as payment_refunded,
               e.amount::text as amount,
               e.subtotal_amount::text as subtotal_amount,
               e.travel_fee::text as travel_fee,
               e.discount_funded_by,
               (select sum(ch.amount_due)::text
                  from booking_charges ch
                  join bookings cb on cb.id = ch.booking_id
                 where coalesce(cb.original_booking_id, cb.id) = e.root_id
                   and ch.status = 'paid') as bills_paid,
               (select max(ch.paid_at)
                  from booking_charges ch
                  join bookings cb on cb.id = ch.booking_id
                 where coalesce(cb.original_booking_id, cb.id) = e.root_id
                   and ch.status = 'paid') as last_bill_paid_at,
               e.scheduled_at,
               e.completed_at,
               e.cancelled_at,
               e.no_show_marked_at,
               e.marked_test_at is not null as marked_test,
               e.guarantee_refund_at is not null as guarantee_refund,
               u.name as customer_name,
               e.booking_type
          from earning e
          left join payments p on p.booking_id = e.id
          left join users u on u.id = e.user_id
      `)
      return rows.map((row) => ({
        rootId: row.root_id,
        vendorId: row.vendor_id,
        status: row.status,
        noShow: row.no_show,
        paymentMethod: row.payment_method,
        paymentStatus: row.payment_status,
        paymentRefunded: row.payment_refunded,
        amount: row.amount,
        subtotalAmount: row.subtotal_amount,
        travelFee: row.travel_fee,
        discountFundedBy: row.discount_funded_by,
        billsPaid: row.bills_paid,
        lastBillPaidAt: toDate(row.last_bill_paid_at),
        scheduledAt: toDate(row.scheduled_at)!,
        completedAt: toDate(row.completed_at),
        cancelledAt: toDate(row.cancelled_at),
        noShowMarkedAt: toDate(row.no_show_marked_at),
        markedTest: row.marked_test,
        guaranteeRefund: row.guarantee_refund,
        customerName: row.customer_name,
        bookingType: row.booking_type,
      }))
    },

    /**
     * The services sold on those chains, from each one's latest row, with
     * the category the catalogue has now (as Statistics reads it).
     */
    async earningItems(vendorId?: string): Promise<EarningItemRow[]> {
      const rows = await conn.execute<{
        root_id: string
        name: string
        category: ServiceCategory
        pricing_type: string
        amount: string
        sort_order: number
      }>(sql`
        with ${earningCte(vendorId)}
        select e.root_id, bi.name, s.category, s.pricing_type, bi.amount::text as amount, bi.sort_order
          from earning e
          join booking_items bi on bi.booking_id = e.id
          join services s on s.id = bi.service_id
      `)
      return rows.map((row) => ({
        rootId: row.root_id,
        name: row.name,
        category: row.category,
        pricingType: row.pricing_type,
        amount: row.amount,
        sortOrder: row.sort_order,
      }))
    },

    /**
     * Refunds on those chains: on any booking of the chain's payment, and on
     * a final bill only when that bill was paid (a stray payment on a
     * replaced bill was never the garage's, so neither is its refund).
     * Failed ones come back too; lib/payouts.ts leaves them out.
     */
    async earningRefunds(vendorId?: string): Promise<EarningRefundRow[]> {
      const rows = await conn.execute<{
        root_id: string
        amount: string
        gateway_status: 'pending' | 'processed' | 'failed' | null
      }>(sql`
        with ${earningCte(vendorId)}
        select e.root_id, rr.amount::text as amount, rr.gateway_status
          from earning e
          join bookings rb on coalesce(rb.original_booking_id, rb.id) = e.root_id
          join refund_records rr on rr.booking_id = rb.id
          left join booking_charges rc on rr.kind = 'bill' and rc.id = rr.target_id
         where rr.kind = 'booking' or (rr.kind = 'bill' and rc.status = 'paid')
      `)
      return rows.map((row) => ({
        rootId: row.root_id,
        amount: row.amount,
        gatewayStatus: row.gateway_status,
      }))
    },

    /** Everything paid on each booking so far, payout by payout. */
    async settled(vendorId?: string): Promise<SettledRow[]> {
      const rows = await conn
        .select({
          rootId: vendorPayoutItems.bookingId,
          payoutId: vendorPayoutItems.payoutId,
          amount: vendorPayoutItems.amount,
          reference: vendorPayouts.reference,
          paidAt: vendorPayouts.paidAt,
        })
        .from(vendorPayoutItems)
        .innerJoin(vendorPayouts, eq(vendorPayouts.id, vendorPayoutItems.payoutId))
        .where(vendorId ? eq(vendorPayouts.vendorId, vendorId) : undefined)
      return rows
    },

    /**
     * Every chain booked before `end`: the queue each garage's free 25 are
     * counted along, read exactly as Statistics reads it.
     */
    queue(end: Date, vendorId?: string): Promise<GarageQueueChain[]> {
      return statsReads(conn).queue(end, vendorId)
    },

    /** A garage's payouts, newest first. */
    payouts(vendorId: string, limit: number): Promise<PayoutRecord[]> {
      return conn
        .select()
        .from(vendorPayouts)
        .where(eq(vendorPayouts.vendorId, vendorId))
        .orderBy(desc(vendorPayouts.paidAt), desc(vendorPayouts.createdAt))
        .limit(limit)
    },

    /** The latest payout of every garage, for the list. */
    async lastPayouts(): Promise<Map<string, { amount: string; paidAt: Date }>> {
      const rows = await conn.execute<{ vendor_id: string; amount: string; paid_at: Date | string }>(sql`
        select distinct on (vendor_id) vendor_id, amount::text as amount, paid_at
          from vendor_payouts
         order by vendor_id, paid_at desc, created_at desc
      `)
      return new Map(rows.map((row) => [row.vendor_id, { amount: row.amount, paidAt: toDate(row.paid_at)! }]))
    },

    /** What each of these payouts paid, booking by booking. */
    payoutItems(payoutIds: string[]): Promise<PayoutItemRecord[]> {
      if (payoutIds.length === 0) return Promise.resolve([])
      return conn.select().from(vendorPayoutItems).where(inArray(vendorPayoutItems.payoutId, payoutIds))
    },

    /** Paid in [start, end): the "Paid this month" figure. */
    async paidBetween(vendorId: string, start: Date, end: Date): Promise<string> {
      const [row] = await conn
        .select({ total: sql<string | null>`sum(${vendorPayouts.amount})::text` })
        .from(vendorPayouts)
        .where(
          and(
            eq(vendorPayouts.vendorId, vendorId),
            sql`${vendorPayouts.paidAt} >= ${start.toISOString()}::timestamptz`,
            sql`${vendorPayouts.paidAt} < ${end.toISOString()}::timestamptz`
          )
        )
      return row?.total ?? '0'
    },

    async garage(vendorId: string): Promise<GarageRow | undefined> {
      const [row] = await conn
        .select({
          id: vendors.id,
          businessName: vendors.businessName,
          deletedAt: vendors.deletedAt,
          purgedAt: vendors.purgedAt,
        })
        .from(vendors)
        .where(eq(vendors.id, vendorId))
      return row
    },

    async garages(ids: string[]): Promise<GarageRow[]> {
      if (ids.length === 0) return []
      return conn
        .select({
          id: vendors.id,
          businessName: vendors.businessName,
          deletedAt: vendors.deletedAt,
          purgedAt: vendors.purgedAt,
        })
        .from(vendors)
        .where(inArray(vendors.id, ids))
    },

    async account(vendorId: string): Promise<PayoutAccountRecord | undefined> {
      const [row] = await conn
        .select()
        .from(vendorPayoutAccounts)
        .where(eq(vendorPayoutAccounts.vendorId, vendorId))
      return row
    },

    accounts(): Promise<PayoutAccountRecord[]> {
      return conn.select().from(vendorPayoutAccounts)
    },
  }
}

/** The writes, inside the transaction that records a payout or saves details. */
function payoutsWrites(tx: Tx) {
  return {
    /**
     * One garage's payouts, one at a time: `pg_advisory_xact_lock('payouts:<garage>')`.
     * Taken on its own, never alongside the booking-write locks (AGENTS.md):
     * nothing else is locked while it is held.
     */
    async lockGarage(vendorId: string) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`payouts:${vendorId}`})::bigint)`)
    },

    async insertPayout(values: {
      vendorId: string
      amount: string
      method: PayoutMethod
      reference: string
      paidAt: Date
      coversFrom: Date
      coversUpTo: Date
      note: string | null
      recordedBy: string
      recordedBySub: string
    }): Promise<PayoutRecord> {
      const [row] = await tx.insert(vendorPayouts).values(values).returning()
      return row
    },

    async insertItems(
      items: Array<{
        payoutId: string
        bookingId: string
        bookingRef: string
        kind: PayoutItemKind
        payableFrom: Date
        price: string
        detlioPromo: string
        garagePromo: string
        refunds: string
        commission: string
        freePosition: number | null
        garageShare: string
        heldByGarage: string
        amount: string
      }>
    ) {
      if (items.length === 0) return []
      return tx.insert(vendorPayoutItems).values(items).returning()
    },

    async upsertAccount(values: {
      vendorId: string
      accountName: string | null
      accountNumber: string | null
      ifsc: string | null
      upiId: string | null
      updatedBy: string
    }): Promise<PayoutAccountRecord> {
      const now = new Date()
      const [row] = await tx
        .insert(vendorPayoutAccounts)
        .values({ ...values, updatedAt: now })
        .onConflictDoUpdate({
          target: vendorPayoutAccounts.vendorId,
          set: {
            accountName: values.accountName,
            accountNumber: values.accountNumber,
            ifsc: values.ifsc,
            upiId: values.upiId,
            updatedBy: values.updatedBy,
            updatedAt: now,
          },
        })
        .returning()
      return row
    },

    async deleteAccount(vendorId: string) {
      await tx.delete(vendorPayoutAccounts).where(eq(vendorPayoutAccounts.vendorId, vendorId))
    },
  }
}

export type PayoutsReads = ReturnType<typeof payoutsReads>
export type PayoutsWork = PayoutsReads & ReturnType<typeof payoutsWrites>

export const payoutsRepository = {
  /**
   * A read in one read-only transaction that gives up after ten seconds a
   * statement, like Statistics: the API holds one database connection,
   * shared with checkout, and a statement must not hold a payment up.
   */
  readOnly<T>(work: (reads: PayoutsReads) => Promise<T>): Promise<T> {
    return db.transaction(
      async (tx) => {
        await tx.execute(sql`set local statement_timeout = '10s'`)
        return work(payoutsReads(tx))
      },
      { accessMode: 'read only' }
    )
  },

  /** Recording a payout or saving payout details: everything in one transaction. */
  transaction<T>(work: (repo: PayoutsWork) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`set local statement_timeout = '10s'`)
      return work({ ...payoutsReads(tx), ...payoutsWrites(tx) })
    })
  },
}
