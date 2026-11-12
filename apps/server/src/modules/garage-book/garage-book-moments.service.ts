import { sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { garageMilestonesSeen } from '../../db/schema.js'
import { AppError } from '../../lib/errors.js'
import {
  GARAGE_BOOK_2_LIMITS,
  isMilestoneKey,
  istMonth,
  milestoneFor,
  milestoneKeysSettled,
  monthBounds,
} from '../../lib/garage-book.js'
import { PAID, at, num } from './garage-book.repository.js'
import type { Viewer } from './garage-book.viewer.js'

/**
 * Moments 5 and 6 (stage 2, approved with the 9 Nov wording).
 *
 *   5. A reminder that pays back: a customer's first visit within 30 days
 *      after a reminder to them "came back after a reminder". Walk-ins and
 *      Detlio bookings both count. The apps show the toast when a job is
 *      saved, and Reminders adds up what reminders earned this month.
 *   6. Milestones in metal: the 100th own customer, the first ₹1 lakh month
 *      (whole-garage takings, as Stats counts them), the best month ever.
 *      Each shows once (garage_milestones_seen). Owner only: they are money.
 */

const DAYS = GARAGE_BOOK_2_LIMITS.reminderPaidBackDays

/** A walk-in is the customer's first finished visit since a reminder sent in the 30 days before it. */
const OWN_CAME_BACK = sql`EXISTS (
  SELECT 1 FROM garage_reminder_sends s
   WHERE s.vendor_id = j.vendor_id AND s.garage_customer_id = j.garage_customer_id
     AND s.sent_at <= j.done_at AND s.sent_at > j.done_at - make_interval(days => ${DAYS})
     AND NOT EXISTS (
       SELECT 1 FROM garage_jobs p
        WHERE p.garage_customer_id = j.garage_customer_id AND p.status = 'done' AND p.id <> j.id
          AND p.done_at > s.sent_at AND p.done_at <= j.done_at
     )
)`

const DETLIO_AT = sql`coalesce(b.completed_at, b.scheduled_at)`

const DETLIO_CAME_BACK = sql`EXISTS (
  SELECT 1 FROM garage_reminder_sends s
   WHERE s.vendor_id = b.vendor_id AND s.user_id = b.user_id
     AND s.sent_at <= ${DETLIO_AT} AND s.sent_at > ${DETLIO_AT} - make_interval(days => ${DAYS})
     AND NOT EXISTS (
       SELECT 1 FROM bookings p
        WHERE p.vendor_id = b.vendor_id AND p.user_id = b.user_id AND p.status = 'completed' AND p.id <> b.id
          AND coalesce(p.completed_at, p.scheduled_at) > s.sent_at
          AND coalesce(p.completed_at, p.scheduled_at) <= ${DETLIO_AT}
     )
)`

export const momentsService = {
  /** Moment 5 on a saved walk-in: what it came to, when it came after a reminder; null otherwise. */
  async reminderPaidBack(vendorId: string, jobId: string): Promise<{ amountPaise: number } | null> {
    const rows = await db.execute<{ total_paise: number | string }>(sql`
      SELECT j.total_paise FROM garage_jobs j
       WHERE j.vendor_id = ${vendorId} AND j.id = ${jobId} AND j.status = 'done' AND ${OWN_CAME_BACK}
    `)
    const row = Array.from(rows)[0]
    return row ? { amountPaise: num(row.total_paise) } : null
  },

  /** Moment 5 on Reminders: what visits after a reminder came to this month, and how many. */
  async reminderEarnings(vendorId: string, now = new Date()) {
    const bounds = monthBounds(istMonth(now))!
    const from = sql`${bounds.start.toISOString()}::timestamptz`
    const to = sql`${bounds.end.toISOString()}::timestamptz`
    const rows = await db.execute<{ n: number | string; total: number | string }>(sql`
      SELECT count(*) AS n, coalesce(sum(paise), 0) AS total FROM (
        SELECT j.total_paise::bigint AS paise FROM garage_jobs j
         WHERE j.vendor_id = ${vendorId} AND j.status = 'done' AND j.done_at >= ${from} AND j.done_at < ${to}
           AND ${OWN_CAME_BACK}
        UNION ALL
        SELECT round(b.amount * 100)::bigint FROM bookings b
         WHERE b.vendor_id = ${vendorId} AND b.status = 'completed' AND ${PAID}
           AND ${DETLIO_AT} >= ${from} AND ${DETLIO_AT} < ${to} AND ${DETLIO_CAME_BACK}
      ) x
    `)
    const row = Array.from(rows)[0]
    return { earnedThisMonthPaise: num(row?.total), cameBack: num(row?.n) }
  },

  /** Moment 6: the milestone to show now, or null. */
  async milestone(viewer: Viewer, now = new Date()) {
    const vendorId = viewer.vendorId
    const [customers, months, seen] = await Promise.all([
      db.execute<{ n: number | string; first_at: Date | string | null }>(sql`
        SELECT count(*) AS n, min(created_at) AS first_at FROM garage_customers WHERE vendor_id = ${vendorId} AND deleted_at IS NULL
      `),
      db.execute<{ month: string; paise: number | string }>(sql`
        SELECT month, sum(paise) AS paise FROM (
          SELECT to_char(done_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS month, total_paise::bigint AS paise
            FROM garage_jobs WHERE vendor_id = ${vendorId} AND status = 'done' AND payment_method IN ('upi', 'cash')
          UNION ALL
          SELECT to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM'), amount_paise::bigint
            FROM garage_payments WHERE vendor_id = ${vendorId} AND kind = 'paid'
          UNION ALL
          SELECT to_char(${DETLIO_AT} AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM'), round(b.amount * 100)::bigint
            FROM bookings b WHERE b.vendor_id = ${vendorId} AND b.status = 'completed' AND ${PAID}
        ) x GROUP BY month
      `),
      db.execute<{ key: string }>(sql`SELECT key FROM garage_milestones_seen WHERE vendor_id = ${vendorId}`),
    ])
    const count = Array.from(customers)[0]
    const found = milestoneFor({
      ownCustomers: num(count?.n),
      months: Array.from(months).map((row) => ({ month: row.month, paise: num(row.paise) })),
      currentMonth: istMonth(now),
      seen: new Set(Array.from(seen).map((row) => row.key)),
    })
    if (!found) return { milestone: null }
    return { milestone: { ...found, since: at(count?.first_at ?? null)?.toISOString() ?? null } }
  },

  /** The card was shown: it never shows again, nor any smaller one of its kind. */
  async markSeen(viewer: Viewer, key: string) {
    if (!isMilestoneKey(key)) throw new AppError(404, 'Milestone not found', 'NOT_FOUND')
    const keys = milestoneKeysSettled(key)
    await db
      .insert(garageMilestonesSeen)
      .values(keys.map((k) => ({ vendorId: viewer.vendorId, key: k })))
      .onConflictDoNothing()
    return { key, seen: true }
  },
}
