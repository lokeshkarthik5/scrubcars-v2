import { sql, type SQL } from 'drizzle-orm'
import { db } from '../../db/index.js'
import type { ServiceCategory } from '../../lib/categories.js'
import { MONEY_LANDED_STATUSES, overrideRateFromPercent, type GarageQueueChain } from '../../lib/commission.js'
import type {
  BusyHourCell,
  OpenCheckouts,
  StatsChainRow,
  StatsItemRow,
} from '../../lib/stats.js'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** An instant as a SQL timestamptz. */
const at = (instant: Date) => sql`${instant.toISOString()}::timestamptz`

/** A Postgres timestamp as postgres-js hands it back: a Date, or its text. */
const toDate = (value: Date | string) => (value instanceof Date ? value : new Date(value))

/**
 * Each booking once, as a reschedule chain: the chain's latest row (the one
 * nothing was moved from), its key (the first booking's id), and when that
 * first booking was made. A reschedule writes a new row, copies the paid
 * payment onto it and cancels the old one as if the customer had, so reading
 * every row would count one car twice and call the move a cancellation.
 * Rows marked Test come back with `marked_test`, for lib/stats.ts to leave
 * out; the queries that group in SQL leave them out themselves.
 */
function chainsCte(vendorId?: string): SQL {
  return sql`
    latest as (
      select b.*, coalesce(b.original_booking_id, b.id) as root_id
        from bookings b
       where not exists (select 1 from bookings moved_to where moved_to.rescheduled_from_id = b.id)
         -- A free redo (Detlio Guarantee, 0051) is the same job again, at
         -- ₹0: not a booking in any figure, nor in the free-25 queue.
         and not b.guarantee_redo
         ${vendorId ? sql`and b.vendor_id = ${vendorId}` : sql``}
    ),
    chains as (
      select l.*, coalesce(r.created_at, l.created_at) as booked_at
        from latest l
        left join bookings r on r.id = l.original_booking_id
    )`
}

/** The IST calendar day of a timestamp, as lib/ist.ts keys days. */
const istDay = (column: SQL) => sql`to_char(${column} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`

const moneyLanded = sql.join(
  MONEY_LANDED_STATUSES.map((status) => sql`${status}`),
  sql`, `
)

/**
 * Reads, through the read-only transaction the service opened. Exported for
 * the payouts (modules/payouts), which count each garage's free 25 along the
 * same queue.
 */
export function statsReads(tx: Tx) {
  return {
    /**
     * Every chain booked in [start, end), with its money: the latest row's
     * payment, the final bills paid on any row of the chain, and every
     * refund recorded against that payment and those paid bills
     * (refund_records keeps each one with its own amount, where the money
     * rows keep only a running total).
     */
    async chains(start: Date, end: Date, vendorId?: string): Promise<StatsChainRow[]> {
      const rows = await tx.execute<{
        root_id: string
        vendor_id: string
        vendor_name: string
        booked_day: string
        status: string
        no_show: 'customer' | 'garage' | null
        accepted_by: string | null
        payment_status: string | null
        payment_amount: string | null
        payment_refunded: string | null
        amount: string
        subtotal_amount: string
        travel_fee: string
        discount_funded_by: 'platform' | 'vendor' | null
        bills_paid: string | null
        refunds_recorded: string | null
        marked_test: boolean
        response_missed: boolean
        guarantee_refund: boolean
      }>(sql`
        with ${chainsCte(vendorId)}
        select c.root_id,
               c.vendor_id,
               v.business_name as vendor_name,
               ${istDay(sql`c.booked_at`)} as booked_day,
               c.status,
               c.no_show,
               c.accepted_by,
               p.status as payment_status,
               -- What the booking was paid at checkout: Razorpay's part plus the
               -- part paid with Detlio credit (0049), which is money Detlio holds
               -- like any other, until it went back as credit on a cancel (then
               -- only Razorpay's part, less its refunds, stays collected).
               (p.amount + case when p.credit_returned_at is null then p.credit_amount else 0 end)::text as payment_amount,
               p.refunded_amount::text as payment_refunded,
               c.amount::text as amount,
               c.subtotal_amount::text as subtotal_amount,
               c.travel_fee::text as travel_fee,
               c.discount_funded_by,
               (select sum(ch.amount_due)::text
                  from booking_charges ch
                  join bookings cb on cb.id = ch.booking_id
                 where (cb.id = c.root_id or cb.original_booking_id = c.root_id)
                   and ch.status = 'paid') as bills_paid,
               -- A bill refund comes off only when that bill's money was
               -- added above (a paid bill). A stray payment on a replaced or
               -- withdrawn bill (lib/refunds.ts isStrayBillPayment) is never
               -- added, so its refund is not taken off either: the two net
               -- to nothing, as on the receipt.
               (select sum(rr.amount)::text
                  from refund_records rr
                  join bookings rb on rb.id = rr.booking_id
                  left join booking_charges rc on rr.kind = 'bill' and rc.id = rr.target_id
                 where (rb.id = c.root_id or rb.original_booking_id = c.root_id)
                   and (rr.kind = 'booking' or (rr.kind = 'bill' and rc.status = 'paid'))
                   -- A refund Razorpay failed moved no money (0036): every
                   -- reader of the history leaves it out (STANDING_REFUND).
                   and rr.gateway_status is distinct from 'failed'
               ) as refunds_recorded,
               c.marked_test_at is not null as marked_test,
               c.response_missed_at is not null as response_missed,
               c.guarantee_refund_at is not null as guarantee_refund
          from chains c
          join vendors v on v.id = c.vendor_id
          left join payments p on p.booking_id = c.id
         where c.booked_at >= ${at(start)}
           and c.booked_at < ${at(end)}
      `)
      return rows.map((row) => ({
        rootId: row.root_id,
        vendorId: row.vendor_id,
        vendorName: row.vendor_name,
        bookedDay: row.booked_day,
        status: row.status,
        noShow: row.no_show,
        acceptedBy: row.accepted_by,
        paymentStatus: row.payment_status,
        paymentAmount: row.payment_amount,
        paymentRefunded: row.payment_refunded,
        amount: row.amount,
        subtotalAmount: row.subtotal_amount,
        travelFee: row.travel_fee,
        discountFundedBy: row.discount_funded_by,
        billsPaid: row.bills_paid,
        refundsRecorded: row.refunds_recorded,
        markedTest: row.marked_test,
        responseMissed: row.response_missed,
        guaranteeRefund: row.guarantee_refund,
      }))
    },

    /**
     * The services sold on each chain booked in [start, end), from its latest
     * row, with each service's category as the catalogue has it now (an item
     * keeps its name and price, not its category), and likewise the
     * service's own commission percent (0064), when it has one.
     */
    async chainItems(start: Date, end: Date, vendorId?: string): Promise<StatsItemRow[]> {
      const rows = await tx.execute<{
        root_id: string
        category: ServiceCategory
        pricing_type: string
        amount: string
        sort_order: number
        commission_rate: string | null
      }>(sql`
        with ${chainsCte(vendorId)}
        select c.root_id, s.category, s.pricing_type, bi.amount::text as amount, bi.sort_order,
               s.commission_rate::text as commission_rate
          from chains c
          join booking_items bi on bi.booking_id = c.id
          join services s on s.id = bi.service_id
         where c.booked_at >= ${at(start)}
           and c.booked_at < ${at(end)}
      `)
      return rows.map((row) => ({
        rootId: row.root_id,
        category: row.category,
        pricingType: row.pricing_type,
        amount: row.amount,
        sortOrder: row.sort_order,
        overrideRate: overrideRateFromPercent(row.commission_rate),
      }))
    },

    /**
     * Every chain booked before `end`, whenever it began: the queue each
     * garage's free 25 are counted along (lib/commission.ts). Slim on
     * purpose, since it reaches back to each garage's first booking.
     */
    async queue(end: Date, vendorId?: string): Promise<GarageQueueChain[]> {
      const rows = await tx.execute<{
        root_id: string
        vendor_id: string
        vendor_name: string
        booked_at: Date | string
        booked_day: string
        status: string
        accepted_by: string | null
        payment_status: string | null
        marked_test: boolean
      }>(sql`
        with ${chainsCte(vendorId)}
        select c.root_id,
               c.vendor_id,
               v.business_name as vendor_name,
               c.booked_at,
               ${istDay(sql`c.booked_at`)} as booked_day,
               c.status,
               c.accepted_by,
               p.status as payment_status,
               c.marked_test_at is not null as marked_test
          from chains c
          join vendors v on v.id = c.vendor_id
          left join payments p on p.booking_id = c.id
         where c.booked_at < ${at(end)}
      `)
      return rows.map((row) => ({
        rootId: row.root_id,
        vendorId: row.vendor_id,
        vendorName: row.vendor_name,
        bookedAt: toDate(row.booked_at),
        bookedDay: row.booked_day,
        status: row.status,
        acceptedBy: row.accepted_by,
        paymentStatus: row.payment_status,
        markedTest: row.marked_test,
      }))
    },

    /**
     * Checkouts opened in [start, end) that never became a booking, counted
     * by how they ended. A consumed checkout is its booking, counted there
     * (and left out with it when the booking is marked Test).
     */
    async openCheckouts(start: Date, end: Date, vendorId?: string): Promise<OpenCheckouts> {
      const rows = await tx.execute<{ status: 'pending' | 'failed'; n: number }>(sql`
        select bi.status, count(*)::int as n
          from booking_intents bi
         where bi.created_at >= ${at(start)}
           and bi.created_at < ${at(end)}
           and bi.status in ('pending', 'failed')
           ${vendorId ? sql`and bi.vendor_id = ${vendorId}` : sql``}
         group by bi.status
      `)
      const counts: OpenCheckouts = { pending: 0, failed: 0 }
      for (const row of rows) counts[row.status] = row.n
      return counts
    },

    /** Each garage's average stars, over its reviews up to `end`; Test bookings' left out. */
    async ratings(end: Date, vendorId?: string): Promise<Map<string, { average: number; count: number }>> {
      const rows = await tx.execute<{ vendor_id: string; average: number | string; count: number }>(sql`
        select r.vendor_id, avg(r.rating)::float8 as average, count(*)::int as count
          from reviews r
          join bookings b on b.id = r.booking_id
         where b.marked_test_at is null
           and r.created_at < ${at(end)}
           ${vendorId ? sql`and r.vendor_id = ${vendorId}` : sql``}
         group by r.vendor_id
      `)
      return new Map(
        rows.map((row) => [row.vendor_id, { average: Number(row.average), count: row.count }])
      )
    },

    /**
     * Paid bookings by the IST weekday (1 = Monday) and hour of their slot,
     * for slots in [start, end). Cancelled ones held nothing, so they are
     * left out; so are Test bookings.
     */
    async busyHours(start: Date, end: Date, vendorId?: string): Promise<BusyHourCell[]> {
      const rows = await tx.execute<{ weekday: number; hour: number; bookings: number }>(sql`
        with ${chainsCte(vendorId)}
        select extract(isodow from c.scheduled_at at time zone 'Asia/Kolkata')::int as weekday,
               extract(hour from c.scheduled_at at time zone 'Asia/Kolkata')::int as hour,
               count(*)::int as bookings
          from chains c
          join payments p on p.booking_id = c.id
         where c.scheduled_at >= ${at(start)}
           and c.scheduled_at < ${at(end)}
           and c.marked_test_at is null
           and c.status <> 'cancelled'
           and p.status::text in (${moneyLanded})
         group by 1, 2
      `)
      return rows.map((row) => ({ weekday: row.weekday, hour: row.hour, bookings: row.bookings }))
    },

    // ─── The Funnel (usage events, 0040) ─────────────────────────────────────
    // Visits are distinct visit ids; the API's own events have none and are
    // counted as events. `mode`, when given, keeps only events that say that
    // booking type.

    /** When the first usage event was recorded, or null before any. */
    async eventsSince(): Promise<Date | null> {
      const [row] = await tx.execute<{ first: Date | string | null }>(sql`
        select min(occurred_at) as first from analytics_events
      `)
      return row?.first ? toDate(row.first) : null
    },

    /** Distinct visits in [start, end), whatever they did. */
    async visits(start: Date, end: Date): Promise<number> {
      const [row] = await tx.execute<{ n: number }>(sql`
        select count(distinct visit_id)::int as n
          from analytics_events
         where occurred_at >= ${at(start)}
           and occurred_at < ${at(end)}
           and visit_id is not null
      `)
      return row?.n ?? 0
    },

    /** For each of `names`: the visits that did it and how many times it happened. */
    async eventCounts(
      start: Date,
      end: Date,
      names: readonly string[],
      mode?: string
    ): Promise<Map<string, { visits: number; events: number }>> {
      if (names.length === 0) return new Map()
      const rows = await tx.execute<{ name: string; visits: number; events: number }>(sql`
        select name, count(distinct visit_id)::int as visits, count(*)::int as events
          from analytics_events
         where name in (${sql.join(
           names.map((name) => sql`${name}`),
           sql`, `
         )})
           and occurred_at >= ${at(start)}
           and occurred_at < ${at(end)}
           ${mode ? sql`and props->>'mode' = ${mode}` : sql``}
         group by name
      `)
      return new Map(rows.map((row) => [row.name, { visits: row.visits, events: row.events }]))
    },

    /** Visits that browsed each category, from the garage list and search. */
    async categoriesBrowsed(
      start: Date,
      end: Date,
      mode?: string
    ): Promise<Array<{ category: string | null; visits: number }>> {
      const rows = await tx.execute<{ category: string | null; visits: number }>(sql`
        select props->>'category' as category, count(distinct visit_id)::int as visits
          from analytics_events
         where name in ('garage_list_view', 'search')
           and occurred_at >= ${at(start)}
           and occurred_at < ${at(end)}
           and props->>'category' is not null
           ${mode ? sql`and props->>'mode' = ${mode}` : sql``}
         group by 1
      `)
      return rows.map((row) => ({ category: row.category, visits: row.visits }))
    },

    /**
     * Each garage's page views (distinct visits) and paid bookings (the
     * API's booking_paid), with its name as it is now; a garage deleted
     * since has none.
     */
    async garageViews(
      start: Date,
      end: Date,
      mode?: string
    ): Promise<Array<{ vendorId: string; name: string | null; views: number; bookings: number }>> {
      const rows = await tx.execute<{
        vendor_id: string
        name: string | null
        views: number
        bookings: number
      }>(sql`
        select e.props->>'vendorId' as vendor_id,
               v.business_name as name,
               (count(distinct e.visit_id) filter (where e.name = 'garage_view'))::int as views,
               (count(*) filter (where e.name = 'booking_paid'))::int as bookings
          from analytics_events e
          left join vendors v on v.id::text = e.props->>'vendorId'
         where e.name in ('garage_view', 'booking_paid')
           and e.occurred_at >= ${at(start)}
           and e.occurred_at < ${at(end)}
           and e.props->>'vendorId' is not null
           ${mode ? sql`and e.props->>'mode' = ${mode}` : sql``}
         group by 1, 2
      `)
      return rows.map((row) => ({
        vendorId: row.vendor_id,
        name: row.name,
        views: row.views,
        bookings: row.bookings,
      }))
    },

    /** Distinct visits by device class. */
    async devices(start: Date, end: Date): Promise<Array<{ device: string | null; visits: number }>> {
      const rows = await tx.execute<{ device: string | null; visits: number }>(sql`
        select device, count(distinct visit_id)::int as visits
          from analytics_events
         where occurred_at >= ${at(start)}
           and occurred_at < ${at(end)}
           and visit_id is not null
         group by device
      `)
      return rows.map((row) => ({ device: row.device, visits: row.visits }))
    },

    /**
     * Every paid booking, ever, of each customer who made a paid booking in
     * [start, end): chains dated by their first row, Test-marked ones left
     * out. Only the account id and the time leave this query, for
     * lib/analytics.ts to count returns and first bookings; neither leaves
     * the API.
     */
    async customerBookings(start: Date, end: Date): Promise<Array<{ userId: string; bookedAt: Date }>> {
      const rows = await tx.execute<{ user_id: string; booked_at: Date | string }>(sql`
        with ${chainsCte()},
        paid as (
          select c.user_id, c.booked_at
            from chains c
            join payments p on p.booking_id = c.id
           where c.marked_test_at is null
             and p.status::text in (${moneyLanded})
        )
        select user_id, booked_at
          from paid
         where user_id in (
           select user_id from paid
            where booked_at >= ${at(start)}
              and booked_at < ${at(end)}
         )
      `)
      return rows.map((row) => ({ userId: row.user_id, bookedAt: toDate(row.booked_at) }))
    },
  }
}

export type StatsReads = ReturnType<typeof statsReads>

export const statsRepository = {
  /**
   * Runs a Statistics read in one read-only transaction that gives up after
   * ten seconds a statement. The API holds a single database connection
   * (db/index.ts), shared with checkout and the payment webhook: a slow
   * report must fail rather than hold a customer's payment up behind it.
   * The reads run one after another; Promise.all would not run them at once
   * on one connection anyway.
   */
  readOnly<T>(work: (reads: StatsReads) => Promise<T>): Promise<T> {
    return db.transaction(
      async (tx) => {
        await tx.execute(sql`set local statement_timeout = '10s'`)
        return work(statsReads(tx))
      },
      { accessMode: 'read only' }
    )
  },
}
